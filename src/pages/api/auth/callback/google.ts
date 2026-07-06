import type { APIRoute } from 'astro';
import { exchangeGoogleCode, createJWT } from '../../../../lib/auth';

export const GET: APIRoute = async ({ url, redirect }) => {
  const code = url.searchParams.get('code');
  if (!code) {
    return redirect('/login?error=missing_code');
  }

  const user = await exchangeGoogleCode(code);
  if (!user) {
    return redirect('/login?error=auth_failed');
  }

  const secret = import.meta.env.AUTH_SECRET || 'fallback-secret';
  const token = createJWT({ user }, secret);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/dashboard',
      'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    },
  });
};
