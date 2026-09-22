import express from 'express';
import multer from 'multer';
import { stringify } from 'csv-stringify/sync';
import { parseFile } from './parse.js';
import { profileDataset, suggestStrategies, applyCleaning } from './engine.js';
import { createSession, getSession, updateSessionCurrent, resetSessionToOriginal } from './store.js';
import { MAX_UPLOAD_MB } from './config.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 } });

export function buildRouter() {
  const router = express.Router();

  router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name must be "file").' });
    let parsed;
    try {
      parsed = parseFile(req.file.buffer, req.file.originalname);
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
    if (!parsed.rows.length) return res.status(400).json({ error: 'File parsed but contains no data rows.' });

    const sessionId = createSession({ rows: parsed.rows, columns: parsed.columns, filename: req.file.originalname });
    const profile = profileDataset(parsed.rows, parsed.columns);
    res.json({ sessionId, filename: req.file.originalname, profile });
  });

  router.get('/session/:id/profile', (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found or expired.' });
    const profile = profileDataset(s.current.rows, s.current.columns);
    res.json({ profile, log: s.log });
  });

  router.get('/session/:id/suggestions', (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found or expired.' });
    const profile = profileDataset(s.current.rows, s.current.columns);
    res.json({ suggestions: suggestStrategies(profile) });
  });

  router.post('/session/:id/clean', (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found or expired.' });
    const config = req.body || {};

    // Always clean from the ORIGINAL data, not the current state -- so
    // re-running with different choices is deterministic and never
    // compounds a previous run's fills on top of itself.
    const before = profileDataset(s.original.rows, s.original.columns);
    let result;
    try {
      result = applyCleaning(s.original.rows, s.original.columns, config);
    } catch (e) {
      // applyCleaning throws for user-actionable config problems (e.g. a
      // fuzzy-dedup/KNN row/unique-value cap exceeded) -- surface that
      // message directly rather than letting it fall through to the
      // generic 500 handler in server.js.
      return res.status(400).json({ error: e.message });
    }
    updateSessionCurrent(s.id, result);
    const after = profileDataset(result.rows, result.columns);

    res.json({
      profileBefore: before,
      profileAfter: after,
      log: result.log,
      rowCountBefore: s.original.rows.length,
      rowCountAfter: result.rows.length,
    });
  });

  router.post('/session/:id/reset', (req, res) => {
    const s = resetSessionToOriginal(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found or expired.' });
    res.json({ ok: true });
  });

  router.get('/session/:id/preview', (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found or expired.' });
    const n = Math.min(Number(req.query.n) || 50, 500);
    res.json({ columns: s.current.columns, rows: s.current.rows.slice(0, n) });
  });

  router.get('/session/:id/download/csv', (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found or expired.' });
    const csv = stringify(s.current.rows, { header: true, columns: s.current.columns });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cleaned_${s.filename.replace(/\.[^.]+$/, '')}.csv"`);
    res.send(csv);
  });

  router.get('/session/:id/download/report', (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found or expired.' });
    const lines = [
      `Cleaning report for: ${s.filename}`,
      `Generated: ${new Date().toISOString()}`,
      `Original rows: ${s.original.rows.length}  ->  Current rows: ${s.current.rows.length}`,
      '',
      'Changes applied:',
      ...(s.log.length ? s.log.map((l) => `  - ${l}`) : ['  (none -- no cleaning applied yet)']),
    ];
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="cleaning_report_${s.filename.replace(/\.[^.]+$/, '')}.txt"`);
    res.send(lines.join('\n'));
  });

  router.get('/session/:id/download/recipe', (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found or expired.' });
    const recipe = req.query.config ? JSON.parse(req.query.config) : {};
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="cleaning_recipe_${s.filename.replace(/\.[^.]+$/, '')}.json"`);
    res.send(JSON.stringify(recipe, null, 2));
  });

  return router;
}
