import type { APIRoute } from 'astro';
import { generateOAuthState, getGitHubAuthURL } from '../../../../lib/auth/oauth';

export const GET: APIRoute = async ({ cookies }) => {
  const state = await generateOAuthState('github');

  cookies.set('oauth_state', state, {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.MODE === 'production',
    sameSite: 'lax',
    maxAge: 300,
  });

  const url = getGitHubAuthURL(state);
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
};
