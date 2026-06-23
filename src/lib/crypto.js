import crypto from 'crypto';

/**
 * Validates a password against a Werkzeug-compatible password hash.
 * Supported format: pbkdf2:sha256:iterations$salt$hash
 * @param {string} password 
 * @param {string} storedHash 
 * @returns {boolean}
 */
export function checkPassword(password, storedHash) {
  if (!storedHash) return false;
  
  const parts = storedHash.split('$');
  if (parts.length !== 3) {
    // If it's a raw unhashed password or simple MD5/SHA, fail or fallback.
    return false;
  }
  
  const methodPart = parts[0]; // e.g. "pbkdf2:sha256:1000000"
  const salt = parts[1]; // e.g. "cXoWiEBk8zzQEvYN"
  const hexHash = parts[2]; // e.g. hex encoded derived key
  
  const methodSubparts = methodPart.split(':');
  if (methodSubparts[0] !== 'pbkdf2' || methodSubparts[1] !== 'sha256') {
    throw new Error(`Unsupported hash method: ${methodPart}`);
  }
  
  const iterations = parseInt(methodSubparts[2], 10);
  const keylen = Buffer.from(hexHash, 'hex').length; // dynamically deduce key length, usually 32 bytes
  
  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keylen, 'sha256');
  return derivedKey.toString('hex') === hexHash;
}

/**
 * Generates a Werkzeug-compatible password hash.
 * Output format: pbkdf2:sha256:1000000$salt$hash
 * @param {string} password 
 * @returns {string}
 */
export function generatePasswordHash(password) {
  // Generate a random 16 character salt using base64 but replacing standard non-alphanumeric chars
  const salt = crypto.randomBytes(12)
    .toString('base64')
    .replace(/\+/g, '.')
    .replace(/\//g, '.')
    .substring(0, 16);
    
  const iterations = 1000000;
  const keylen = 32; // 256 bits
  
  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keylen, 'sha256');
  return `pbkdf2:sha256:${iterations}$${salt}$${derivedKey.toString('hex')}`;
}
