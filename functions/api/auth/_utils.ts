export interface User {
  id: string;
  username: string;
  password_hash: string;
  password_salt: string;
}

export interface Session {
  token: string;
  user_id: string;
  expires_at: string;
}

/**
 * Secure password hashing using PBKDF2
 */
export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string, salt: string }> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  
  const baseKey = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    256
  );
  
  return {
    hash: bytesToHex(new Uint8Array(derivedBits)),
    salt: bytesToHex(salt)
  };
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const result = await hashPassword(password, salt);
  return result.hash === hash;
}

/**
 * Session management
 */
export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

  await db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  )
    .bind(token, userId, expiresAt.toISOString())
    .run();

  return token;
}

export async function verifySession(db: D1Database, token: string): Promise<string | null> {
  const session = await db.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?"
  )
    .bind(token)
    .first<{ user_id: string, expires_at: string }>();

  if (!session) return null;

  if (new Date(session.expires_at) < new Date()) {
    // Session expired - could delete here too
    return null;
  }

  return session.user_id;
}

/**
 * Helpers
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
