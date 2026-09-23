import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';
import { listLiveSheets, buildJob } from '@/lib/phpRegistry.js';
import { postPhp, sanitiseRow } from '@/lib/phpClient.js';

export async function GET(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = user.role === 'super_admin' || user.role === 'admin';
  const sheets = listLiveSheets()
    .filter((s) => isAdmin || user.thematic === s.thematic)
    .map(({ path, ...rest }) => rest);
  return NextResponse.json({ sheets });
}

export async function POST(req) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body = {};
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sheet = body.sheet;
  if (!sheet) {
    return NextResponse.json({ error: 'Missing sheet' }, { status: 400 });
  }

  let job;
  try {
    job = buildJob(sheet, body);
  } catch (err) {
    if (err.code === 'NEEDS_DISEASE_ID') {
      return NextResponse.json({ error: err.message, needs_disease_id: true }, { status: 400 });
    }
    if (err.code === 'NEEDS_SYMPTOM_ID') {
      return NextResponse.json({ error: err.message, needs_symptom_id: true }, { status: 400 });
    }
    throw err;
  }

  if (!job) {
    return NextResponse.json({ error: `Unknown sheet: ${sheet}` }, { status: 400 });
  }

  const isAdmin = user.role === 'super_admin' || user.role === 'admin';
  if (!isAdmin && user.thematic !== job.thematic) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const timeout = Number(process.env.API_TIMEOUT) || 45;
    const rows = await postPhp(job.endpoint, job.body, {
      timeout,
      altUrls: job.altUrls
    });
    const PREVIEW_CAP = 20;
    const records = rows.map(sanitiseRow);
    const truncated = Boolean(job.heavy) && records.length > PREVIEW_CAP;
    return NextResponse.json({
      sheet: job.sheet,
      heavy: job.heavy,
      count: records.length,
      truncated,
      records: truncated ? records.slice(0, PREVIEW_CAP) : records
    });
  } catch (err) {
    const message = err.response?.data
      ? String(err.response.data).substring(0, 300)
      : (err.message || 'Request failed');
    console.error('[php/query]', sheet, message);
    return NextResponse.json({
      error: 'Unable to load records.',
      sheet: job.sheet
    }, { status: 502 });
  }
}
