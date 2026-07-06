import type { APIRoute } from 'astro';
import { generateOAuthState, getGoogleAuthURL } from '../../../../lib/auth/oauth';

export const GET: APIRoute = async ({ cookies }) => {
  const state = generateOAuthState('google');

  cookies.set('oauth_state', state, {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.MODE === 'production',
    sameSite: 'lax',
    maxAge: 300,
  });

  const url = getGoogleAuthURL(state);
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
};
