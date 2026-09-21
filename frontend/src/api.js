import axios from 'axios';

const client = axios.create({ baseURL: '/api' });

export async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}

export async function getSuggestions(sessionId) {
  const { data } = await client.get(`/session/${sessionId}/suggestions`);
  return data.suggestions;
}

export async function applyClean(sessionId, config) {
  const { data } = await client.post(`/session/${sessionId}/clean`, config);
  return data;
}

export async function resetSession(sessionId) {
  await client.post(`/session/${sessionId}/reset`);
}

export async function getPreview(sessionId, n = 50) {
  const { data } = await client.get(`/session/${sessionId}/preview`, { params: { n } });
  return data;
}

export function downloadUrl(sessionId, kind, config) {
  const base = `/api/session/${sessionId}/download/${kind}`;
  if (kind === 'recipe' && config) {
    return `${base}?config=${encodeURIComponent(JSON.stringify(config))}`;
  }
  return base;
}

export function errorMessage(e) {
  return e?.response?.data?.error || e?.message || 'Something went wrong.';
}
