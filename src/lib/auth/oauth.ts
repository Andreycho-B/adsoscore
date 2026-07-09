import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '../prisma';
import type { SessionUser } from './session';

function getAuthSecret(): Uint8Array {
  const secret = import.meta.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is required');
  }
  return new TextEncoder().encode(secret);
}

export interface OAuthState {
  provider: string;
  csrfToken: string;
  timestamp: number;
}

export async function generateOAuthState(provider: string): Promise<string> {
  const state: OAuthState = {
    provider,
    csrfToken: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  const data = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = await new SignJWT({ data })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(getAuthSecret());
  return `${data}.${signature}`;
}

export async function validateOAuthState(state: string): Promise<OAuthState | null> {
  try {
    const parts = state.split('.');
    if (parts.length < 2) return null;

    const data = parts[0];
    const signature = parts.slice(1).join('.');

    const secret = getAuthSecret();
    const { payload } = await jwtVerify(signature, secret);

    if (!payload.data || payload.data !== data) return null;

    const decoded = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (!decoded.provider || !decoded.csrfToken || !decoded.timestamp) return null;

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (decoded.timestamp < fiveMinutesAgo) return null;

    return decoded as OAuthState;
  } catch {
    return null;
  }
}

function getAppUrl(): string {
  return import.meta.env.PUBLIC_APP_URL
    || (typeof process !== 'undefined' ? process.env.PUBLIC_APP_URL : undefined)
    || (typeof process !== 'undefined' ? process.env.RENDER_EXTERNAL_URL : undefined)
    || 'http://localhost:4321';
}

export function getGoogleAuthURL(state: string): string {
  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID environment variable is required');

  const redirectUri = `${getAppUrl()}/api/auth/callback/google`;
  const scope = 'openid email profile';
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&state=${state}`;
}

export function getGitHubAuthURL(state: string): string {
  const clientId = import.meta.env.GITHUB_CLIENT_ID;
  if (!clientId) throw new Error('GITHUB_CLIENT_ID environment variable is required');

  const redirectUri = `${getAppUrl()}/api/auth/callback/github`;
  const scope = 'read:user user:email';
  return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
}

export async function exchangeGoogleCode(code: string): Promise<SessionUser | null> {
  try {
    const clientId = import.meta.env.GOOGLE_CLIENT_ID;
    const clientSecret = import.meta.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.error('Google OAuth credentials not configured');
      return null;
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${getAppUrl()}/api/auth/callback/google`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      console.error(`Google token exchange failed: ${tokenRes.status}`);
      return null;
    }

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Google token exchange returned no access_token');
      return null;
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      console.error(`Google userinfo fetch failed: ${userRes.status}`);
      return null;
    }

    const userData = await userRes.json();

    const existingUser = await prisma.user.findUnique({
      where: { provider_providerId: { provider: 'google', providerId: userData.id } },
    });

    // Control de colisión de email para evitar crash P2002
    const userWithEmail = await prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (userWithEmail && (!existingUser || existingUser.id !== userWithEmail.id)) {
      console.error(`Email collision: ${userData.email} already exists under provider ${userWithEmail.provider}`);
      throw new Error('email_collision');
    }

    let user;
    if (existingUser) {
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: { name: userData.name, image: userData.picture, email: userData.email },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: userData.email,
          name: userData.name,
          image: userData.picture,
          provider: 'google',
          providerId: userData.id,
        },
      });
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      provider: 'google',
    };
  } catch (error) {
    console.error('Google OAuth error:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

export async function exchangeGitHubCode(code: string): Promise<SessionUser | null> {
  try {
    const clientId = import.meta.env.GITHUB_CLIENT_ID;
    const clientSecret = import.meta.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.error('GitHub OAuth credentials not configured');
      return null;
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      console.error(`GitHub token exchange failed: ${tokenRes.status}`);
      return null;
    }

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('GitHub token exchange returned no access_token');
      return null;
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      console.error(`GitHub user fetch failed: ${userRes.status}`);
      return null;
    }

    const userData = await userRes.json();

    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    let primaryEmail = userData.email;
    if (emailRes.ok) {
      const emails = await emailRes.json();
      const primary = emails.find((e: { primary: boolean }) => e.primary);
      if (primary) primaryEmail = primary.email;
    }

    if (!primaryEmail) {
      console.error('GitHub user has no email');
      return null;
    }

    const providerId = String(userData.id);
    const existingUser = await prisma.user.findUnique({
      where: { provider_providerId: { provider: 'github', providerId } },
    });

    // Control de colisión de email para evitar crash P2002
    const userWithEmail = await prisma.user.findUnique({
      where: { email: primaryEmail },
    });

    if (userWithEmail && (!existingUser || existingUser.id !== userWithEmail.id)) {
      console.error(`Email collision: ${primaryEmail} already exists under provider ${userWithEmail.provider}`);
      throw new Error('email_collision');
    }

    let user;
    if (existingUser) {
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: { name: userData.name || userData.login, image: userData.avatar_url, email: primaryEmail },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: primaryEmail,
          name: userData.name || userData.login,
          image: userData.avatar_url,
          provider: 'github',
          providerId,
        },
      });
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      provider: 'github',
    };
  } catch (error) {
    console.error('GitHub OAuth error:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}
