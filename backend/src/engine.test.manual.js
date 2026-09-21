// Manual sanity check, not a formal test suite -- run with `node src/engine.test.manual.js`.
import { profileDataset, suggestStrategies, applyCleaning } from './engine.js';

const columns = ['market', 'date', 'price', 'category'];
const rows = [];
// Build a small synthetic time series per market with gaps of varying length + an outlier + duplicates.
for (const market of ['A', 'B']) {
  for (let w = 0; w < 20; w++) {
    const d = new Date(2024, 0, 1 + w * 7);
    let price = 100 + w * 2 + (market === 'B' ? 10 : 0);
    if (w === 10) price = 5000; // outlier
    let priceVal = String(price);
    if ([3, 4].includes(w)) priceVal = ''; // short gap (2 weeks)
    if ([12, 13, 14, 15].includes(w)) priceVal = ''; // medium gap (4 weeks)
    rows.push({ market, date: d.toISOString().slice(0, 10), price: priceVal, category: w % 3 === 0 ? '' : 'veg' });
  }
}
rows.push({ ...rows[0] }); // exact duplicate

console.log('=== PROFILE (before) ===');
const profile = profileDataset(rows, columns);
console.log(JSON.stringify(profile, null, 2).slice(0, 2000));

console.log('\n=== SUGGESTIONS ===');
const suggestions = suggestStrategies(profile);
console.log(suggestions);

console.log('\n=== APPLY CLEANING ===');
const config = {
  dropDuplicates: true,
  normalizeColumnNames: false,
  dateColumn: 'date',
  groupColumn: 'market',
  perColumn: {
    price: { missingStrategy: 'group_median', outlierAction: 'flag', outlierBounds: profile.columns.find((c) => c.name === 'price').suggestedOutlierBounds },
    category: { missingStrategy: 'mode' },
  },
};
const result = applyCleaning(rows, columns, config);
console.log('LOG:');
result.log.forEach((l) => console.log(' -', l));
console.log('\nRow count before/after:', rows.length, result.rows.length);
console.log('\nSample rows (market A, weeks 2-6):');
console.log(result.rows.filter((r) => r.market === 'A').slice(2, 7));
console.log('\nSample rows (market A, weeks 11-16, medium gap):');
console.log(result.rows.filter((r) => r.market === 'A').slice(11, 16));
console.log('\nOutlier row (week 10):');
console.log(result.rows.filter((r) => r.market === 'A')[10]);
