import type { APIContext } from 'astro';
import crypto from 'crypto';
import { prisma } from './prisma';

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

function base64url(data: Buffer | Uint8Array | string): string {
  const str = typeof data === 'string' ? data : data.toString('base64');
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64');
}

export function createJWT(payload: Record<string, unknown>, secret: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }));
  const data = `${header}.${body}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const signature = base64url(hmac.digest());
  return `${data}.${signature}`;
}

function verifyJWT(token: string, secret: string): Record<string, unknown> | null {
  try {
    const [header, body, signature] = token.split('.');
    const data = `${header}.${body}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    const expectedSig = base64url(hmac.digest());
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(base64urlDecode(body).toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSession(context: APIContext): Session {
  const cookieHeader = context.request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=').map(s => s.trim())));
  const token = cookies['session_token'];

  if (!token) {
    return { user: null };
  }

  const secret = import.meta.env.AUTH_SECRET || 'fallback-secret';
  const payload = verifyJWT(token, secret) as Record<string, unknown> | null;

  if (!payload || !payload.user) {
    return { user: null };
  }

  return { user: payload.user as SessionUser };
}

export function setSession(context: APIContext, user: SessionUser): void {
  const secret = import.meta.env.AUTH_SECRET || 'fallback-secret';
  const token = createJWT({ user }, secret);
  
  context.cookies.set('session_token', token, {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.MODE === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession(context: APIContext): void {
  context.cookies.set('session_token', '', {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.MODE === 'production',
    sameSite: 'lax',
    maxAge: 0,
  });
}

export function getGoogleAuthURL(): string {
  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${import.meta.env.PUBLIC_APP_URL}/api/auth/callback/google`;
  const scope = 'openid email profile';
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline`;
}

export function getGitHubAuthURL(): string {
  const clientId = import.meta.env.GITHUB_CLIENT_ID;
  const redirectUri = `${import.meta.env.PUBLIC_APP_URL}/api/auth/callback/github`;
  const scope = 'read:user user:email';
  return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
}

export async function exchangeGoogleCode(code: string): Promise<SessionUser | null> {
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: import.meta.env.GOOGLE_CLIENT_ID,
        client_secret: import.meta.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${import.meta.env.PUBLIC_APP_URL}/api/auth/callback/google`,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return null;

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    const user = await prisma.user.upsert({
      where: { email: userData.email },
      create: {
        email: userData.email,
        name: userData.name,
        image: userData.picture,
        provider: 'google',
      },
      update: {
        name: userData.name,
        image: userData.picture,
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      provider: 'google',
    };
  } catch {
    return null;
  }
}

export async function exchangeGitHubCode(code: string): Promise<SessionUser | null> {
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: import.meta.env.GITHUB_CLIENT_ID,
        client_secret: import.meta.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return null;

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const emails = await emailRes.json();
    const primaryEmail = emails.find((e: { primary: boolean }) => e.primary)?.email || userData.email;

    const user = await prisma.user.upsert({
      where: { email: primaryEmail },
      create: {
        email: primaryEmail,
        name: userData.name || userData.login,
        image: userData.avatar_url,
        provider: 'github',
      },
      update: {
        name: userData.name || userData.login,
        image: userData.avatar_url,
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      provider: 'github',
    };
  } catch {
    return null;
  }
}
