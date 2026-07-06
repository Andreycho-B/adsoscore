import { SignJWT, jwtVerify } from 'jose';

function getAuthSecret(): Uint8Array {
  const secret = import.meta.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is required');
  }
  return new TextEncoder().encode(secret);
}

export async function createJWT(payload: Record<string, unknown>): Promise<string> {
  const secret = getAuthSecret();
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
  return token;
}

export async function verifyJWT(token: string): Promise<Record<string, unknown> | null> {
  try {
    const secret = getAuthSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
