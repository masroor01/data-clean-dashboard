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

function isBlank(v) {
  return v === null || v === undefined || v === '' || (typeof v === 'string' && v.trim() === '');
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

  const numericCount = sample.filter((v) => NUMERIC_RE.test(String(v).trim())).length;
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
  const n = Number(String(v).replace(/,/g, ''));
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
    }
    return profile;
  });

  // Duplicate rows: identical across every column (string-compared).
  const seen = new Map();
  let duplicateRowCount = 0;
  for (const r of rows) {
    const key = columns.map((c) => String(r[c] ?? '')).join('');
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
 *   perColumn: { [colName]: { missingStrategy, outlierAction, outlierBounds } }
 * }
 */
export function applyCleaning(rows, columns, config) {
  const log = [];
  let workingRows = rows.map((r) => ({ ...r }));
  let workingColumns = [...columns];

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
      const key = workingColumns.map((c) => String(r[c] ?? '')).join('');
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
  // review flag column, since "outside the IQR fence" is a statistical
  // suggestion, not proof of a data error (see engine.js header comment).
  for (const [colName, colConfig] of Object.entries(config.perColumn || {})) {
    if (colConfig.outlierAction !== 'flag' || !colConfig.outlierBounds) continue;
    const { low, high } = colConfig.outlierBounds;
    const flagCol = `${colName}_outlier_flag`;
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

  return { rows: workingRows, columns: workingColumns, log };
}
