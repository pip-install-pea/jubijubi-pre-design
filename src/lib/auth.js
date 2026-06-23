import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'ksaljblgasbjfggjbkjfdrbfjkgddhkjjhkfjkjdjkhfgsahfshjdfgjshjagjfhkjhvhkdjhfvjgvchkvhgs');

/**
 * Signs a user object into a JWT.
 * @param {object} user 
 * @returns {Promise<string>} Signed token
 */
export async function signToken(user) {
  return await new SignJWT({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role_name || user.role || 'user',
    thematic: user.thematic || null
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}

/**
 * Verifies a JWT token.
 * @param {string} token 
 * @returns {Promise<object|null>} Parsed token payload or null
 */
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Helper to retrieve and verify session user from a Next.js Request object.
 * @param {object} req 
 * @returns {Promise<object|null>}
 */
export async function getSessionUser(req) {
  const token = req.cookies?.get('session')?.value;
  if (!token) return null;
  return await verifyToken(token);
}
