# Data Clean Dashboard

A general-purpose tabular data cleaning & preprocessing dashboard. Upload a
CSV/TSV, get an automatic profile (types, missing %, duplicates, outlier
candidates), configure how to clean it, and download the cleaned file plus
a change report and a reusable JSON recipe.

React (Vite) frontend + Express backend, deployed as a single Node process
(the backend serves the built frontend). In-memory sessions only — nothing
is written to disk, and uploads expire automatically after 2 hours.

Implements the generic, dataset-agnostic cleaning techniques used in the
[TOP Digital Twin](https://topdigitaltwin.micskuast.in) agricultural
price-forecasting project (gap-length-aware imputation, missingness flags,
IQR outlier suggestion), generalized for arbitrary tabular data. See the
app's own About page for full scope and limitations.

## Local development

```bash
npm install --prefix frontend
npm install --prefix backend
npm run dev --prefix backend      # backend on :4100
npm run dev --prefix frontend     # frontend on :5173, proxies /api to :4100
```

## Production build & run

```bash
npm run build   # builds frontend/dist, installs backend deps
npm start        # serves frontend/dist + API from one Node process
```

Reads `PORT` from the environment (default `4100`).

## Notes

- Excel (`.xlsx`/`.xls`) is intentionally unsupported — the common Node
  library for reading it has unpatched high-severity vulnerabilities, and
  this tool accepts uploads from anyone. Export to CSV first.
- No accounts, no persistence — sessions live in memory only, per process.
