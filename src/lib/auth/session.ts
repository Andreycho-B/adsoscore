import type { APIContext } from 'astro';
import { createJWT, verifyJWT } from './jwt';

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  provider: string;
}

export interface Session {
  user: SessionUser | null;
}

const COOKIE_NAME = 'session_token';
const MAX_AGE = 60 * 60 * 24 * 7;

function getCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.MODE === 'production',
    sameSite: 'lax' as const,
    maxAge: MAX_AGE,
  };
}

export async function getSession(context: APIContext): Promise<Session> {
  const token = context.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return { user: null };
  }

  const payload = await verifyJWT(token);

  if (!payload || !payload.user) {
    return { user: null };
  }

  return { user: payload.user as SessionUser };
}

export async function setSession(context: APIContext, user: SessionUser): Promise<void> {
  const token = await createJWT({ user });
  context.cookies.set(COOKIE_NAME, token, getCookieOptions());
}

export function clearSession(context: APIContext): void {
  context.cookies.set(COOKIE_NAME, '', {
    ...getCookieOptions(),
    maxAge: 0,
  });
}
