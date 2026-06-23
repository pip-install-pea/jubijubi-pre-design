import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth.js';

export async function GET(req) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ user: null });
    }
    
    return NextResponse.json({ user });
  } catch (err) {
    console.error('Error in /api/auth/me:', err);
    return NextResponse.json({ user: null });
  }
}
