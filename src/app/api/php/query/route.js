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
  const sheets = listLiveSheets().filter((s) => isAdmin || user.thematic === s.thematic);
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
    const records = rows.map(sanitiseRow);
    return NextResponse.json({
      sheet: job.sheet,
      endpoint: job.endpoint,
      body: job.body,
      heavy: job.heavy,
      count: records.length,
      records
    });
  } catch (err) {
    const message = err.response?.data
      ? String(err.response.data).substring(0, 300)
      : (err.message || 'PHP request failed');
    console.error('[php/query]', sheet, message);
    return NextResponse.json({
      error: message,
      sheet: job.sheet,
      endpoint: job.endpoint,
      body: job.body
    }, { status: 502 });
  }
}
