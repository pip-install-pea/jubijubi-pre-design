import axios from 'axios';
import { API_BASE } from './phpRegistry.js';

const HTML_RE = /<[^>]+>/g;

export function parseApiResponse(raw) {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        raw = JSON.parse(trimmed);
      } catch (e) {
        throw new Error(`Invalid JSON string returned from API: ${trimmed.substring(0, 200)}`);
      }
    } else {
      throw new Error(`API returned error string: ${trimmed.substring(0, 200)}`);
    }
  }

  if (Array.isArray(raw)) {
    const skipKeys = new Set(['status', 'msg', 'message', 'error']);
    const result = [];
    for (const item of raw) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const keys = Object.keys(item);
        if (keys.length > 0 && keys.every((k) => skipKeys.has(k))) continue;
      }
      result.push(item);
    }
    return result;
  }

  if (typeof raw === 'object' && raw !== null) {
    if (raw.status === false || raw.status === 'error' || raw.status === 'fail') {
      const errMsg = raw.msg || raw.message || 'Unknown API error status';
      throw new Error(`API error response: ${errMsg}`);
    }
    const skipKeys = new Set(['status', 'msg', 'message', 'error']);
    const keys = Object.keys(raw);
    if (keys.length > 0 && keys.every((k) => skipKeys.has(k))) return [];
    if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
      const inner = { ...raw.data };
      if (raw.year != null && inner.year == null) inner.year = raw.year;
      return [inner];
    }
    for (const val of Object.values(raw)) {
      if (Array.isArray(val)) return parseApiResponse(val);
    }
    return [raw];
  }
  return [];
}

export async function postPhpRaw(endpoint, payload, { timeout = 30, maxRetries = 2, altUrls = [] } = {}) {
  const urls = [`${API_BASE}/${endpoint}`, ...altUrls];
  let lastError = null;

  for (const url of urls) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(url, payload, {
          timeout: timeout * 1000,
          headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
      } catch (err) {
        lastError = err;
        const status = err.response?.status;
        if (status === 404 && url !== urls[urls.length - 1]) break;
        if (status === 500) throw err;
        if (attempt < maxRetries) {
          await new Promise((res) => setTimeout(res, Math.pow(2, attempt) * 1000));
        }
      }
    }
  }
  throw lastError;
}

export async function postPhp(endpoint, payload, opts = {}) {
  return parseApiResponse(await postPhpRaw(endpoint, payload, opts));
}

export async function postPhpEnvelope(endpoint, payload, opts = {}) {
  const raw = await postPhpRaw(endpoint, payload, opts);
  const rows = parseApiResponse(raw);
  const meta = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, val] of Object.entries(raw)) {
      if (key === 'data' || key === 'status' || key === 'msg' || key === 'message') continue;
      if (val != null && typeof val !== 'object') meta[key] = val;
    }
    if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
      Object.assign(meta, raw.data);
    }
  }
  return { raw, meta, rows };
}

export function sanitiseRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = v;
    } else if (typeof v === 'string') {
      out[k] = v.replace(HTML_RE, '').substring(0, 1000);
    } else if (typeof v === 'object') {
      try {
        out[k] = JSON.stringify(v).substring(0, 2000);
      } catch (e) {
        out[k] = String(v);
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}
