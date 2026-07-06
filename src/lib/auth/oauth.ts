import { prisma } from '../prisma';

export interface OAuthState {
  provider: string;
  csrfToken: string;
  timestamp: number;
}

export function generateOAuthState(provider: string): string {
  const state: OAuthState = {
    provider,
    csrfToken: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

export function validateOAuthState(state: string): OAuthState | null {
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    if (!decoded.provider || !decoded.csrfToken || !decoded.timestamp) return null;

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (decoded.timestamp < fiveMinutesAgo) return null;

    return decoded as OAuthState;
  } catch {
    return null;
  }
}

export function getGoogleAuthURL(state: string): string {
  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID environment variable is required');

  const redirectUri = `${import.meta.env.PUBLIC_APP_URL}/api/auth/callback/google`;
  const scope = 'openid email profile';
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&state=${state}`;
}

export function getGitHubAuthURL(state: string): string {
  const clientId = import.meta.env.GITHUB_CLIENT_ID;
  if (!clientId) throw new Error('GITHUB_CLIENT_ID environment variable is required');

  const redirectUri = `${import.meta.env.PUBLIC_APP_URL}/api/auth/callback/github`;
  const scope = 'read:user user:email';
  return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
}

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  provider: string;
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
        redirect_uri: `${import.meta.env.PUBLIC_APP_URL}/api/auth/callback/google`,
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

    const user = await prisma.user.upsert({
      where: { email: userData.email },
      create: {
        email: userData.email,
        name: userData.name,
        image: userData.picture,
        provider: 'google',
        providerId: userData.id,
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

    const user = await prisma.user.upsert({
      where: { email: primaryEmail },
      create: {
        email: primaryEmail,
        name: userData.name || userData.login,
        image: userData.avatar_url,
        provider: 'github',
        providerId: String(userData.id),
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
  } catch (error) {
    console.error('GitHub OAuth error:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}
