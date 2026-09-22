// Core cleaning engine -- the generic, dataset-agnostic techniques carried
// over from TOP Digital Twin's data pipelines (see project README):
//   - gap-length-aware time-series imputation (short gaps: interpolate,
//     medium gaps: same-group/same-period median, long gaps: leave missing)
//   - IQR-based outlier suggestion (never asserted as ground truth -- always
//     user-editable, since real plausible ranges need domain knowledge this
//     tool doesn't have)
//   - missingness flags on every imputed value, so a filled cell is always
//     distinguishable from a genuinely observed one
//   - deduplication, type inference, column-name normalization
//
// Deliberately NOT included: anything that requires domain-specific
// knowledge of what a "correct" value looks like (that was the actual hard
// part of TOP Digital Twin's own cleaning work, and doesn't generalize).

const NUMERIC_RE = /^-?\d+(\.\d+)?(e-?\d+)?$/i;
const BOOL_TRUE = new Set(['true', 'yes', 'y', '1']);
const BOOL_FALSE = new Set(['false', 'no', 'n', '0']);
const DATE_HINT_RE = /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}|^\d{1,2}-\d{1,2}-\d{2,4}/;
const CURRENCY_SYMBOLS_RE = /[$€£¥₹₩¢]/g;
// Unlikely-to-collide field separator for building a row identity key from
// concatenated column values -- joining with '' let two DIFFERENT rows
// produce the SAME key (e.g. {a:"1",b:"23"} and {a:"12",b:"3"} both -> "123"),
// silently over-counting duplicates.
const ROW_KEY_SEP = '';

function isBlank(v) {
  return v === null || v === undefined || v === '' || (typeof v === 'string' && v.trim() === '');
}

/** Strips common real-world numeric formatting down to a plain numeric
 * string -- e.g. "($1,234.56)" -> "-1234.56", "45%" -> "45". The %% sign
 * is stripped, NOT divided by 100 -- keeps the number as displayed rather
 * than silently asserting a fraction-vs-percent convention this tool has
 * no way to know for sure. */
function stripNumericFormatting(raw) {
  let s = String(raw).trim();
  if (s === '') return s;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
  s = s.replace(CURRENCY_SYMBOLS_RE, '').replace(/,/g, '').replace(/%/g, '').trim();
  if (negative && s && !s.startsWith('-')) s = '-' + s;
  return s;
}

function isNumericLike(v) {
  return NUMERIC_RE.test(stripNumericFormatting(String(v).trim()));
}

function rowKey(row, columns) {
  return columns.map((c) => String(row[c] ?? '').trim()).join(ROW_KEY_SEP);
}

function tryParseDate(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!DATE_HINT_RE.test(s)) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/** Infer a single column's type from a sample of its non-blank values. */
export function detectColumnType(values) {
  const sample = values.filter((v) => !isBlank(v)).slice(0, 500);
  if (sample.length === 0) return 'empty';

  const numericCount = sample.filter((v) => isNumericLike(v)).length;
  if (numericCount / sample.length >= 0.95) return 'numeric';

  const boolCount = sample.filter((v) => {
    const s = String(v).trim().toLowerCase();
    return BOOL_TRUE.has(s) || BOOL_FALSE.has(s);
  }).length;
  if (boolCount / sample.length >= 0.95) return 'boolean';

  const dateCount = sample.filter((v) => tryParseDate(v) !== null).length;
  if (dateCount / sample.length >= 0.9) return 'date';

  const uniqueRatio = new Set(sample.map(String)).size / sample.length;
  return uniqueRatio > 0.5 ? 'text' : 'categorical';
}

function toNumber(v) {
  if (isBlank(v)) return null;
  const n = Number(stripNumericFormatting(String(v)));
  return Number.isFinite(n) ? n : null;
}

function quantile(sortedArr, q) {
  if (sortedArr.length === 0) return null;
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos), rest = pos - base;
  if (sortedArr[base + 1] !== undefined) {
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  }
  return sortedArr[base];
}

/** Full dataset profile: per-column stats + duplicate row count. Read-only, no mutation. */
export function profileDataset(rows, columns) {
  const nRows = rows.length;
  const colProfiles = columns.map((col) => {
    const raw = rows.map((r) => r[col]);
    const nMissing = raw.filter(isBlank).length;
    const type = detectColumnType(raw);
    const nonBlank = raw.filter((v) => !isBlank(v));
    const uniqueCount = new Set(nonBlank.map(String)).size;

    const profile = {
      name: col,
      type,
      nMissing,
      pctMissing: nRows ? +(100 * nMissing / nRows).toFixed(1) : 0,
      uniqueCount,
      sample: nonBlank.slice(0, 5).map(String),
    };

    if (type === 'numeric') {
      const nums = nonBlank.map(toNumber).filter((n) => n !== null).sort((a, b) => a - b);
      if (nums.length) {
        const q1 = quantile(nums, 0.25), q3 = quantile(nums, 0.75);
        const iqr = q3 - q1;
        profile.stats = {
          min: nums[0], max: nums[nums.length - 1],
          mean: +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4),
          median: quantile(nums, 0.5), q1, q3,
        };
        // Suggested outlier bounds -- standard 1.5*IQR fences, clearly
        // labeled as a suggestion (see routes.js/frontend), never applied
        // without the user reviewing/adjusting them.
        profile.suggestedOutlierBounds = { low: +(q1 - 1.5 * iqr).toFixed(4), high: +(q3 + 1.5 * iqr).toFixed(4) };
        profile.outlierCount = nums.filter((n) => n < profile.suggestedOutlierBounds.low || n > profile.suggestedOutlierBounds.high).length;
      }
      // True if any real value needs stripping before it's plain-numeric
      // (currency symbol, thousands comma, %, accounting parens) -- lets
      // the UI offer an explicit normalize-numeric-formatting action
      // rather than silently rewriting values nobody asked to change.
      profile.hasNumericFormatting = nonBlank.some((v) => !NUMERIC_RE.test(String(v).trim()));
    }
    return profile;
  });

  // Duplicate rows: identical across every column (string-compared).
  const seen = new Map();
  let duplicateRowCount = 0;
  for (const r of rows) {
    const key = rowKey(r, columns);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const count of seen.values()) if (count > 1) duplicateRowCount += count - 1;

  // Candidate date column(s) -- for offering time-series-aware options.
  const dateColumns = colProfiles.filter((p) => p.type === 'date').map((p) => p.name);

  return { nRows, nColumns: columns.length, columns: colProfiles, duplicateRowCount, dateColumns };
}

/** Per-column cleaning suggestions -- always editable, never silently applied. */
export function suggestStrategies(profile) {
  return profile.columns.map((col) => {
    const s = { column: col.name, type: col.type };
    if (col.pctMissing > 0) {
      if (col.type === 'numeric') {
        s.missingStrategy = profile.dateColumns.length ? 'group_median' : 'median';
      } else if (col.type === 'categorical' || col.type === 'boolean') {
        s.missingStrategy = 'mode';
      } else {
        s.missingStrategy = 'leave';
      }
    } else {
      s.missingStrategy = 'none_needed';
    }
    if (col.type === 'numeric' && col.suggestedOutlierBounds) {
      s.outlierAction = col.outlierCount > 0 ? 'flag' : 'none_needed';
      s.outlierBounds = col.suggestedOutlierBounds;
    }
    return s;
  });
}

// ── Fuzzy deduplication (entity resolution) ─────────────────────────────
// Normalizes near-duplicate text VALUES within a column (e.g. "Apple Inc."
// / "Apple" / "APPLE INC" -> one canonical label) -- distinct from
// dropDuplicates, which removes whole duplicate ROWS. Uses normalized
// Levenshtein similarity (no new dependency) with greedy, frequency-first
// clustering: the most common spelling in the data becomes each cluster's
// canonical representative, since that's usually the correct one.
const MAX_FUZZY_UNIQUE = 5000; // pairwise comparison is O(k^2); cap keeps this fast

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function levenshteinSimilarity(a, b) {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function tokenize(s) {
  return new Set(s.split(/[^a-z0-9]+/i).map((t) => t.toLowerCase()).filter(Boolean));
}

/** Overlap coefficient (|intersection| / smaller set size) -- catches
 * subset/abbreviation variants like "Apple" vs "Apple Inc." (shared token
 * "apple" fully contained in the larger name) that plain edit distance
 * scores as dissimilar because the strings differ in length. */
function tokenOverlapSimilarity(a, b) {
  const ta = tokenize(a), tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

/** Combines edit-distance similarity (catches typos within a token, e.g.
 * "Microsft" vs "Microsoft") with token-overlap similarity (catches
 * added/dropped tokens, e.g. "Apple" vs "Apple Inc.") -- neither alone
 * covers both of fuzzy dedup's two classic cases well. */
function stringSimilarity(a, b) {
  return Math.max(levenshteinSimilarity(a, b), tokenOverlapSimilarity(a, b));
}

/** Clusters near-duplicate values in a column and returns a value->canonical map. */
function fuzzyDedupeColumn(values, threshold) {
  const freq = new Map();
  for (const v of values) {
    if (isBlank(v)) continue;
    const s = String(v);
    freq.set(s, (freq.get(s) || 0) + 1);
  }
  const uniques = [...freq.keys()];
  if (uniques.length > MAX_FUZZY_UNIQUE) {
    throw new Error(`Too many unique values (${uniques.length}) for fuzzy dedup -- max ${MAX_FUZZY_UNIQUE}.`);
  }
  // Most-frequent spelling first, so common variants become the canonical
  // representative rather than whatever happened to appear first in the file.
  uniques.sort((a, b) => freq.get(b) - freq.get(a));
  const norm = (s) => s.trim().toLowerCase();
  const clusters = []; // { rep, members: string[] }
  for (const v of uniques) {
    const nv = norm(v);
    let best = null, bestSim = 0;
    for (const c of clusters) {
      const sim = stringSimilarity(nv, norm(c.rep));
      if (sim > bestSim) { bestSim = sim; best = c; }
    }
    if (best && bestSim >= threshold) {
      best.members.push(v);
    } else {
      clusters.push({ rep: v, members: [v] });
    }
  }
  const mapping = new Map();
  for (const c of clusters) for (const m of c.members) mapping.set(m, c.rep);
  return { mapping, clusterCount: clusters.length, uniqueCount: uniques.length };
}

// ── Rolling Z-score outlier detection ───────────────────────────────────
// Alternative to the fixed 1.5xIQR fence -- flags a value against a
// trailing window's own mean/std (within date order, optionally per
// group) instead of one global threshold, so it adapts to trend/level
// shifts over time rather than assuming the whole series is stationary.
function rollingZScoreOutliers(rows, colName, dateCol, groupCol, windowSize, zThreshold) {
  const groups = groupCol ? [...new Set(rows.map((r) => r[groupCol]))] : ['__all__'];
  const flags = new Array(rows.length).fill(0);
  let flagged = 0, evaluated = 0;

  for (const g of groups) {
    const idxs = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !groupCol || r[groupCol] === g)
      .sort((a, b) => new Date(a.r[dateCol]) - new Date(b.r[dateCol]))
      .map(({ i }) => i);

    const series = idxs.map((i) => toNumber(rows[i][colName]));
    for (let k = 0; k < series.length; k++) {
      const val = series[k];
      if (val === null) continue;
      const windowVals = series.slice(Math.max(0, k - windowSize), k).filter((v) => v !== null);
      if (windowVals.length < Math.min(3, windowSize)) continue; // not enough history to judge yet
      const mean = windowVals.reduce((a, b) => a + b, 0) / windowVals.length;
      const variance = windowVals.reduce((a, b) => a + (b - mean) ** 2, 0) / windowVals.length;
      const std = Math.sqrt(variance);
      evaluated++;
      if (std === 0) continue; // flat window -- any deviation would be trivially "infinite" z, skip rather than false-flag
      const z = Math.abs((val - mean) / std);
      if (z > zThreshold) {
        flags[idxs[k]] = 1;
        flagged++;
      }
    }
  }
  return { flags, flagged, evaluated };
}

// ── KNN imputation ───────────────────────────────────────────────────────
// Fills a missing value from the average of its k nearest rows (by other
// numeric columns), rather than one dataset-wide median/mean -- picks up
// on multivariate structure a single-column fill can't see (e.g. a
// missing value on a row that otherwise looks like a specific cluster of
// other rows gets filled toward that cluster, not the global average).
const MAX_KNN_ROWS = 20000; // distance computation is roughly O(missing x n); keeps this responsive in a single Node request
const DEFAULT_KNN_K = 5;

/** Euclidean distance over only the coordinates present in both vectors,
 * scaled up by (total dims / present dims) so a row with some missing
 * feature values can still be compared fairly (standard "nan-euclidean"
 * approach) rather than being excluded entirely. */
function nanEuclidean(a, b) {
  let sumSq = 0, present = 0;
  for (let j = 0; j < a.length; j++) {
    if (a[j] === null || b[j] === null) continue;
    sumSq += (a[j] - b[j]) ** 2;
    present++;
  }
  if (present === 0) return null;
  return Math.sqrt(sumSq * (a.length / present));
}

/** Returns { filledValues, imputed } -- filledValues[i] is the KNN-imputed
 * value for row i if it was missing and had usable neighbors, else null. */
function knnImpute(rows, targetCol, featureCols, k) {
  const rawMatrix = rows.map((r) => featureCols.map((c) => toNumber(r[c])));
  // Z-normalize each feature so no single column's scale dominates distance.
  const stats = featureCols.map((_, j) => {
    const vals = rawMatrix.map((row) => row[j]).filter((v) => v !== null);
    if (!vals.length) return { mean: 0, std: 1 };
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    return { mean, std: Math.sqrt(variance) || 1 };
  });
  const normMatrix = rawMatrix.map((row) => row.map((v, j) => (v === null ? null : (v - stats[j].mean) / stats[j].std)));

  const targetVals = rows.map((r) => toNumber(r[targetCol]));
  const donorIdxs = [];
  targetVals.forEach((v, i) => { if (v !== null) donorIdxs.push(i); });

  const filledValues = new Array(rows.length).fill(null);
  let imputed = 0;
  for (let i = 0; i < rows.length; i++) {
    if (targetVals[i] !== null) continue;
    const vecI = normMatrix[i];
    const candidates = [];
    for (const j of donorIdxs) {
      const dist = nanEuclidean(vecI, normMatrix[j]);
      if (dist === null) continue;
      candidates.push({ dist, val: targetVals[j] });
    }
    if (!candidates.length) continue;
    candidates.sort((a, b) => a.dist - b.dist);
    const nearest = candidates.slice(0, k);
    let wSum = 0, valSum = 0;
    for (const c of nearest) {
      const w = 1 / (c.dist + 1e-6); // inverse-distance weighting; epsilon avoids div-by-zero on an exact match
      wSum += w;
      valSum += w * c.val;
    }
    filledValues[i] = valSum / wSum;
    imputed++;
  }
  return { filledValues, imputed };
}

// -- Isolation Forest (multivariate outlier detection) --------------------
// Judges a ROW as anomalous based on how easily it separates from the rest
// of the dataset across MULTIPLE numeric columns at once -- catches joint
// anomalies that look normal in any single column's own IQR/rolling-Z
// check but are unusual in combination (e.g. a low price at a high
// volume, when low price and high volume are each individually common).
// Standard algorithm (Liu, Ting, Zhou 2008): build many random "isolation
// trees" on small subsamples; anomalous points isolate (reach a leaf)
// faster on average than normal points, since fewer random splits are
// needed to wall off an outlier.
const MAX_ISOLATION_FOREST_ROWS = 100000;
const IF_N_TREES = 100;
const IF_SAMPLE_SIZE = 256;

// Deterministic small PRNG (mulberry32) so re-running "Apply Cleaning"
// with identical settings gives identical flags -- Math.random() would
// make the same config produce a different result every run, which would
// look like a bug.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Average path length of an unsuccessful BST search over n items --
// normalizes tree depth into a comparable anomaly score across forests
// built on different sample sizes.
function averagePathLengthC(n) {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

function buildIsolationTree(indices, matrix, featureIdxs, rng, depth, maxDepth) {
  if (depth >= maxDepth || indices.length <= 1) return { size: indices.length };

  const candidateFeatures = featureIdxs.filter((f) => {
    let min = Infinity, max = -Infinity;
    for (const i of indices) {
      const v = matrix[i][f];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return max > min;
  });
  if (!candidateFeatures.length) return { size: indices.length };

  const feature = candidateFeatures[Math.floor(rng() * candidateFeatures.length)];
  let min = Infinity, max = -Infinity;
  for (const i of indices) {
    const v = matrix[i][feature];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const splitValue = min + rng() * (max - min);
  const left = [], right = [];
  for (const i of indices) (matrix[i][feature] < splitValue ? left : right).push(i);
  if (!left.length || !right.length) return { size: indices.length };

  return {
    feature, splitValue,
    left: buildIsolationTree(left, matrix, featureIdxs, rng, depth + 1, maxDepth),
    right: buildIsolationTree(right, matrix, featureIdxs, rng, depth + 1, maxDepth),
  };
}

function pathLength(node, vec, depth) {
  if (node.feature === undefined) return depth + averagePathLengthC(node.size);
  const branch = vec[node.feature] < node.splitValue ? node.left : node.right;
  return pathLength(branch, vec, depth + 1);
}

/** Returns { scores, evaluatedCount } -- scores[i] in (0,1) for rows with
 * every selected feature present (~0.5 = normal, closer to 1 = more
 * anomalous), null for rows excluded because a selected feature was
 * missing (never fabricates a score from incomplete data). */
function isolationForestScores(rows, featureCols, seed) {
  const rawMatrix = rows.map((r) => featureCols.map((c) => toNumber(r[c])));
  const evaluatedIdxs = [];
  rawMatrix.forEach((row, i) => { if (row.every((v) => v !== null)) evaluatedIdxs.push(i); });

  const scores = new Array(rows.length).fill(null);
  if (evaluatedIdxs.length < 10) return { scores, evaluatedCount: 0 };

  const featureIdxs = featureCols.map((_, j) => j);
  const rng = mulberry32(seed);
  const sampleSize = Math.min(IF_SAMPLE_SIZE, evaluatedIdxs.length);
  const maxDepth = Math.ceil(Math.log2(Math.max(sampleSize, 2)));

  const trees = [];
  for (let t = 0; t < IF_N_TREES; t++) {
    const pool = [...evaluatedIdxs];
    const sample = [];
    for (let k = 0; k < sampleSize; k++) {
      const idx = Math.floor(rng() * pool.length);
      sample.push(pool[idx]);
      pool[idx] = pool[pool.length - 1];
      pool.pop();
    }
    trees.push(buildIsolationTree(sample, rawMatrix, featureIdxs, rng, 0, maxDepth));
  }

  const c = averagePathLengthC(sampleSize);
  for (const i of evaluatedIdxs) {
    let totalPath = 0;
    for (const tree of trees) totalPath += pathLength(tree, rawMatrix[i], 0);
    scores[i] = Math.pow(2, -(totalPath / trees.length) / c);
  }
  return { scores, evaluatedCount: evaluatedIdxs.length };
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null, bestCount = -1;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
}

/** Consecutive-missing run length per row, mirroring Script 09's
 * _gap_lengths -- used to decide interpolate vs group-median vs leave. */
function gapLengths(values) {
  const isNull = values.map((v) => v === null || v === undefined);
  const lengths = new Array(values.length).fill(0);
  let i = 0;
  while (i < values.length) {
    if (!isNull[i]) { i++; continue; }
    let j = i;
    while (j < values.length && isNull[j]) j++;
    const runLen = j - i;
    for (let k = i; k < j; k++) lengths[k] = runLen;
    i = j;
  }
  return lengths;
}

function linearInterpolate(values) {
  const out = [...values];
  let i = 0;
  while (i < out.length) {
    if (out[i] !== null) { i++; continue; }
    let j = i;
    while (j < out.length && out[j] === null) j++;
    const left = i > 0 ? out[i - 1] : null;
    const right = j < out.length ? out[j] : null;
    if (left !== null && right !== null) {
      const step = (right - left) / (j - i + 1);
      for (let k = i; k < j; k++) out[k] = left + step * (k - i + 1);
    }
    i = j;
  }
  return out;
}

/**
 * Apply a confirmed cleaning config to the dataset. Returns { rows,
 * columns, log } -- log is a human-readable list of every change made
 * (mirrors this project's own script-run console logs), for the
 * downloadable cleaning report.
 *
 * config: {
 *   dropDuplicates: bool,
 *   normalizeColumnNames: bool,
 *   dateColumn: string|null,       // for group_median strategy
 *   groupColumn: string|null,      // optional grouping key (e.g. "market")
 *   shortGapMax: number,           // default 2
 *   mediumGapMax: number,          // default 8
 *   perColumn: { [colName]: {
 *     missingStrategy, outlierAction, outlierBounds,
 *     fuzzyDedup: { threshold } | undefined,
 *     outlierMethod: 'iqr' | 'rolling_zscore',
 *     rollingWindow, zThreshold  // used when outlierMethod === 'rolling_zscore'
 *   } }
 * }
 */
export function applyCleaning(rows, columns, config) {
  const log = [];
  let workingRows = rows.map((r) => ({ ...r }));
  let workingColumns = [...columns];

  // Fuzzy deduplication -- normalizes near-duplicate text VALUES within a
  // column (entity resolution) BEFORE exact row-level dedup, so rows that
  // only differ by a now-normalized spelling also get caught by
  // dropDuplicates below.
  for (const [colName, colConfig] of Object.entries(config.perColumn || {})) {
    if (!colConfig.fuzzyDedup || !workingColumns.includes(colName)) continue;
    const threshold = colConfig.fuzzyDedup.threshold ?? 0.85;
    const { mapping, clusterCount, uniqueCount } = fuzzyDedupeColumn(
      workingRows.map((r) => r[colName]), threshold,
    );
    let changed = 0;
    workingRows.forEach((r) => {
      const v = r[colName];
      if (isBlank(v)) return;
      const canonical = mapping.get(String(v));
      if (canonical !== undefined && canonical !== v) { r[colName] = canonical; changed++; }
    });
    log.push(`"${colName}": merged ${uniqueCount} unique value(s) into ${clusterCount} canonical entit${clusterCount === 1 ? 'y' : 'ies'} (threshold ${threshold}); ${changed} cell(s) updated.`);
  }

  // Normalize numeric formatting -- rewrites a numeric column's real values
  // to plain numbers (strips currency symbols, thousands commas, %, and
  // accounting-style parens-negative). Opt-in per column, since it changes
  // every real cell's displayed form, not just gap-fills -- consistent
  // with this engine's rule of never rewriting more than the user asked for.
  for (const [colName, colConfig] of Object.entries(config.perColumn || {})) {
    if (!colConfig.normalizeNumericFormat || !workingColumns.includes(colName)) continue;
    let changed = 0;
    workingRows.forEach((r) => {
      const raw = r[colName];
      if (isBlank(raw)) return;
      const n = toNumber(raw);
      if (n === null) return;
      if (String(raw) !== String(n)) { r[colName] = n; changed++; }
    });
    log.push(`"${colName}": normalized ${changed} value(s) to plain numeric form (stripped currency/%/thousands-comma formatting).`);
  }

  if (config.normalizeColumnNames) {
    const renameMap = {};
    workingColumns = workingColumns.map((c) => {
      const clean = c.trim().replace(/\s+/g, '_').replace(/[^\w]/g, '').toLowerCase();
      if (clean !== c) renameMap[c] = clean;
      return clean;
    });
    if (Object.keys(renameMap).length) {
      workingRows = workingRows.map((r) => {
        const nr = {};
        for (const [oldName, newName] of Object.entries(renameMap)) nr[newName] = r[oldName];
        for (const c of columns) if (!(c in renameMap)) nr[renameMap[c] || c] = r[c];
        return nr;
      });
      log.push(`Normalized ${Object.keys(renameMap).length} column name(s): ${Object.entries(renameMap).map(([o, n]) => `"${o}"->"${n}"`).join(', ')}`);
    }
  }

  if (config.dropDuplicates) {
    const seen = new Set();
    const before = workingRows.length;
    workingRows = workingRows.filter((r) => {
      const key = rowKey(r, workingColumns);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const removed = before - workingRows.length;
    if (removed) log.push(`Dropped ${removed} duplicate row(s).`);
  }

  const shortMax = config.shortGapMax ?? 2;
  const mediumMax = config.mediumGapMax ?? 8;

  for (const [colName, colConfig] of Object.entries(config.perColumn || {})) {
    if (!workingColumns.includes(colName)) continue;
    const strategy = colConfig.missingStrategy;
    if (!strategy || strategy === 'none_needed' || strategy === 'leave') continue;

    const flagCol = `${colName}_was_missing`;
    const rawValues = workingRows.map((r) => r[colName]);
    const wasMissing = rawValues.map(isBlank);
    const nMissingBefore = wasMissing.filter(Boolean).length;
    if (nMissingBefore === 0) continue;

    if (strategy === 'median' || strategy === 'mean') {
      const nums = rawValues.map(toNumber).filter((n) => n !== null);
      if (!nums.length) continue;
      const sorted = [...nums].sort((a, b) => a - b);
      const fillValue = strategy === 'median' ? quantile(sorted, 0.5) : nums.reduce((a, b) => a + b, 0) / nums.length;
      let filled = 0;
      workingRows.forEach((r, i) => {
        if (wasMissing[i]) { r[colName] = fillValue; filled++; }
        r[flagCol] = wasMissing[i] ? 1 : 0;
      });
      log.push(`"${colName}": filled ${filled} missing value(s) with column ${strategy} (${fillValue.toFixed ? fillValue.toFixed(4) : fillValue}); added "${flagCol}" flag.`);
    } else if (strategy === 'mode') {
      const nonBlank = rawValues.filter((v) => !isBlank(v));
      const fillValue = mode(nonBlank);
      let filled = 0;
      workingRows.forEach((r, i) => {
        if (wasMissing[i]) { r[colName] = fillValue; filled++; }
        r[flagCol] = wasMissing[i] ? 1 : 0;
      });
      log.push(`"${colName}": filled ${filled} missing value(s) with column mode ("${fillValue}"); added "${flagCol}" flag.`);
    } else if (strategy === 'knn') {
      if (workingRows.length > MAX_KNN_ROWS) {
        throw new Error(`"${colName}": KNN imputation needs the dataset under ${MAX_KNN_ROWS.toLocaleString()} rows (this file has ${workingRows.length.toLocaleString()}) -- use median or gap-aware fill instead.`);
      }
      const featureCols = workingColumns.filter((c) => c !== colName && !c.endsWith('_was_missing') && !c.endsWith('_outlier_flag'));
      const numericFeatureCols = featureCols.filter((c) => detectColumnType(workingRows.map((r) => r[c])) === 'numeric');
      workingRows.forEach((r, i) => { r[flagCol] = wasMissing[i] ? 1 : 0; });
      if (!workingColumns.includes(flagCol)) workingColumns.push(flagCol);
      if (!numericFeatureCols.length) {
        log.push(`"${colName}": KNN imputation skipped -- no other numeric columns available to compute similarity from. Added "${flagCol}" flag.`);
        continue;
      }
      const k = colConfig.knnK ?? DEFAULT_KNN_K;
      const { filledValues, imputed } = knnImpute(workingRows, colName, numericFeatureCols, k);
      workingRows.forEach((r, i) => {
        if (wasMissing[i] && filledValues[i] !== null) r[colName] = filledValues[i];
      });
      log.push(`"${colName}": filled ${imputed} of ${nMissingBefore} missing value(s) via KNN (k=${k}) using ${numericFeatureCols.length} numeric feature column(s) [${numericFeatureCols.join(', ')}]; ${nMissingBefore - imputed} left missing (no usable neighbors). Added "${flagCol}" flag.`);
      continue;
    } else if (strategy === 'group_median') {
      // Gap-length-aware, mirroring Script 09: short gaps interpolate,
      // medium gaps use same-(group, calendar-month) median, long gaps
      // left missing (flagged only, not fabricated).
      const dateCol = config.dateColumn;
      const groupCol = config.groupColumn;
      const groups = groupCol
        ? [...new Set(workingRows.map((r) => r[groupCol]))]
        : ['__all__'];

      let interpolated = 0, groupFilled = 0, leftMissing = 0;
      for (const g of groups) {
        const idxs = workingRows
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => !groupCol || r[groupCol] === g)
          .sort((a, b) => (dateCol ? new Date(a.r[dateCol]) - new Date(b.r[dateCol]) : 0))
          .map(({ i }) => i);

        const seriesRaw = idxs.map((i) => toNumber(workingRows[i][colName]));
        const gaps = gapLengths(seriesRaw);
        const interpolatedSeries = linearInterpolate(seriesRaw);

        // Month-of-year medians within this group, from real (non-imputed) values only.
        const monthMedians = {};
        if (dateCol) {
          const byMonth = {};
          idxs.forEach((i, k) => {
            if (seriesRaw[k] === null) return;
            const d = tryParseDate(workingRows[i][dateCol]);
            if (!d) return;
            const m = d.getMonth();
            (byMonth[m] = byMonth[m] || []).push(seriesRaw[k]);
          });
          for (const [m, vals] of Object.entries(byMonth)) {
            monthMedians[m] = quantile([...vals].sort((a, b) => a - b), 0.5);
          }
        }
        const groupFallback = (() => {
          const real = seriesRaw.filter((v) => v !== null).sort((a, b) => a - b);
          return real.length ? quantile(real, 0.5) : null;
        })();

        idxs.forEach((i, k) => {
          const r = workingRows[i];
          r[flagCol] = wasMissing[i] ? 1 : 0;
          if (seriesRaw[k] !== null) return; // real value, untouched
          const gapLen = gaps[k];
          if (gapLen <= shortMax) {
            if (interpolatedSeries[k] !== null) { r[colName] = interpolatedSeries[k]; interpolated++; return; }
          }
          if (gapLen <= mediumMax) {
            let fill = groupFallback;
            if (dateCol) {
              const d = tryParseDate(r[dateCol]);
              if (d && monthMedians[d.getMonth()] !== undefined) fill = monthMedians[d.getMonth()];
            }
            if (fill !== null) { r[colName] = fill; groupFilled++; return; }
          }
          leftMissing++; // long gap or no fallback available -- left NaN, flag still set
        });
      }
      log.push(`"${colName}": ${interpolated} short-gap value(s) interpolated (<=${shortMax}), ${groupFilled} medium-gap value(s) filled with group/period median (<=${mediumMax}), ${leftMissing} long-gap value(s) left missing (flagged, not fabricated). Added "${flagCol}" flag.`);
    }

    if (!workingColumns.includes(flagCol)) workingColumns.push(flagCol);
  }

  // Outlier flagging -- NEVER auto-clips/drops a value; always adds a
  // review flag column, since "outside the IQR fence" (or "|z| too high")
  // is a statistical suggestion, not proof of a data error (see engine.js
  // header comment).
  for (const [colName, colConfig] of Object.entries(config.perColumn || {})) {
    if (colConfig.outlierAction !== 'flag') continue;
    const flagCol = `${colName}_outlier_flag`;

    if (colConfig.outlierMethod === 'rolling_zscore') {
      if (!config.dateColumn) continue; // rolling z-score needs a date order to roll over
      const windowSize = colConfig.rollingWindow ?? 8;
      const zThreshold = colConfig.zThreshold ?? 3;
      const { flags, flagged, evaluated } = rollingZScoreOutliers(
        workingRows, colName, config.dateColumn, config.groupColumn, windowSize, zThreshold,
      );
      workingRows.forEach((r, i) => { r[flagCol] = flags[i]; });
      if (!workingColumns.includes(flagCol)) workingColumns.push(flagCol);
      log.push(`"${colName}": flagged ${flagged} of ${evaluated} evaluated value(s) with |z|>${zThreshold} vs. a trailing ${windowSize}-period rolling mean/std as "${flagCol}" -- not removed, for manual review.`);
      continue;
    }

    if (!colConfig.outlierBounds) continue;
    const { low, high } = colConfig.outlierBounds;
    let flagged = 0;
    workingRows.forEach((r) => {
      const n = toNumber(r[colName]);
      const isOutlier = n !== null && (n < low || n > high);
      r[flagCol] = isOutlier ? 1 : 0;
      if (isOutlier) flagged++;
    });
    if (!workingColumns.includes(flagCol)) workingColumns.push(flagCol);
    log.push(`"${colName}": flagged ${flagged} value(s) outside [${low}, ${high}] as "${flagCol}" -- not removed, for manual review.`);
  }

  // Multivariate outlier detection (Isolation Forest) -- dataset-level,
  // not per-column, since it judges a ROW as anomalous using several
  // columns jointly. Adds a shared score + flag column, never removes rows.
  if (config.isolationForest && config.isolationForest.columns) {
    const ifCols = config.isolationForest.columns.filter((c) => workingColumns.includes(c));
    if (ifCols.length < 2) {
      throw new Error(`Isolation Forest needs at least 2 valid numeric columns (got ${ifCols.length}).`);
    }
    if (workingRows.length > MAX_ISOLATION_FOREST_ROWS) {
      throw new Error(`Isolation Forest needs the dataset under ${MAX_ISOLATION_FOREST_ROWS.toLocaleString()} rows (this file has ${workingRows.length.toLocaleString()}) -- use the per-column IQR or rolling Z-score outlier methods instead.`);
    }
    const threshold = config.isolationForest.threshold ?? 0.6;
    const { scores, evaluatedCount } = isolationForestScores(workingRows, ifCols, 42);
    const scoreCol = 'isolation_outlier_score';
    const flagCol = 'isolation_outlier_flag';
    let flagged = 0;
    workingRows.forEach((r, i) => {
      const s = scores[i];
      r[scoreCol] = s === null ? '' : +s.toFixed(4);
      const isOutlier = s !== null && s > threshold;
      r[flagCol] = s === null ? '' : (isOutlier ? 1 : 0);
      if (isOutlier) flagged++;
    });
    if (!workingColumns.includes(scoreCol)) workingColumns.push(scoreCol);
    if (!workingColumns.includes(flagCol)) workingColumns.push(flagCol);
    if (evaluatedCount === 0) {
      log.push(`Isolation Forest: skipped -- fewer than 10 rows had every selected column [${ifCols.join(', ')}] present.`);
    } else {
      log.push(`Isolation Forest [${ifCols.join(', ')}]: flagged ${flagged} of ${evaluatedCount} evaluated row(s) with anomaly score > ${threshold} as "${flagCol}" (raw score in "${scoreCol}") -- not removed, for manual review.`);
    }
  }

  return { rows: workingRows, columns: workingColumns, log };
}
