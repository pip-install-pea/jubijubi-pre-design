import { NextResponse } from 'next/server';

export async function POST(req) {
  const response = NextResponse.json({ message: 'Logged out successful' });
  
  // Clear the session cookie
  response.cookies.set('session', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/'
  });

  return response;
}

// Support GET requests as well for robustness
export async function GET(req) {
  const response = NextResponse.json({ message: 'Logged out successful' });
  response.cookies.set('session', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/'
  });
  return response;
}
