// AI prompt templates — user-editable, seeded from DEFAULT_TEMPLATES.
import { DEFAULT_TEMPLATES } from '../export.js';

function loadTemplates() {
  try {
    const saved = localStorage.getItem('promptTemplates');
    const parsed = saved ? JSON.parse(saved) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* noop */ }
  return DEFAULT_TEMPLATES.map(t => ({ ...t }));
}
const loaded = loadTemplates();
let templates = $state(loaded);
let defaultId = $state(DEFAULT_TEMPLATES[0].id);

try {
  const savedDefault = localStorage.getItem('promptDefault');
  if (savedDefault && loaded.some(t => t.id === savedDefault)) defaultId = savedDefault;
} catch { /* noop */ }

function persist() {
  try { localStorage.setItem('promptTemplates', JSON.stringify(templates)); } catch { /* noop */ }
}

export function getTemplates() { return templates; }
export function getDefaultId() { return defaultId; }
export function getTemplate(id) { return templates.find(t => t.id === id) ?? null; }

export function setDefaultId(id) {
  if (!templates.some(t => t.id === id)) return;
  defaultId = id;
  try { localStorage.setItem('promptDefault', id); } catch { /* noop */ }
}

export function updateTemplate(id, body) {
  const t = templates.find(t => t.id === id);
  if (!t) return;
  t.body = body;
  persist();
}

export function resetTemplate(id) {
  const shipped = DEFAULT_TEMPLATES.find(t => t.id === id);
  const idx = templates.findIndex(t => t.id === id);
  if (!shipped || idx === -1) return;
  templates[idx] = { ...shipped };
  persist();
}
