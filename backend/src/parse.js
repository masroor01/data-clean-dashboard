// File parsing: CSV/TSV (csv-parse) -> array of row objects + column name
// list, preserving raw string values (type inference happens separately in
// engine.js, deliberately not here -- parsing and type detection are
// different concerns and keeping them separate makes both easier to test
// and reason about).
//
// Excel (.xlsx/.xls) deliberately NOT supported: the only maintained npm
// parser (xlsx/SheetJS) carries an unpatched, no-fix-available high
// severity vulnerability (prototype pollution + ReDoS, GHSA-4r6h-8v6p-xvw6
// / GHSA-5pgg-2g8v-p4x9) -- unacceptable for a tool whose entire purpose is
// accepting untrusted uploads from the public. Revisit if/when a properly
// maintained alternative exists; for now, ask users to export to CSV first
// (one click in Excel/Sheets).
import { parse } from 'csv-parse/sync';

const MAX_ROWS = 200000; // sane cap for an in-memory, single-process tool

export function parseFile(buffer, originalName) {
  const lower = originalName.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    return parseCSV(buffer, lower.endsWith('.tsv') ? '\t' : ',');
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    throw Object.assign(new Error('Excel files are not supported yet (a known security issue in the available parsing library). Please export/save as .csv and upload that instead.'), { status: 400 });
  }
  throw Object.assign(new Error('Unsupported file type -- upload a .csv or .tsv file.'), { status: 400 });
}

function parseCSV(buffer, delimiter) {
  const text = buffer.toString('utf-8');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    delimiter,
    relax_column_count: true,
    bom: true,
  });
  if (records.length > MAX_ROWS) {
    throw Object.assign(new Error(`File has ${records.length.toLocaleString()} rows -- this tool caps at ${MAX_ROWS.toLocaleString()} for in-memory processing.`), { status: 400 });
  }
  const columns = records.length ? Object.keys(records[0]) : [];
  return { rows: records, columns };
}
