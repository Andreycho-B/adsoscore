import type { APIRoute } from 'astro';
import { exchangeGoogleCode, validateOAuthState, setSession } from '../../../../lib/auth';
import type { SessionUser } from '../../../../lib/auth';

export const GET: APIRoute = async (context) => {
  const { url, redirect, cookies } = context;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return redirect('/login?error=missing_params');
  }

  const storedState = cookies.get('oauth_state')?.value;
  if (!storedState) {
    return redirect('/login?error=missing_state');
  }

  const decodedState = validateOAuthState(state);
  const decodedStored = validateOAuthState(storedState);

  if (!decodedState || !decodedStored) {
    return redirect('/login?error=invalid_state');
  }

  if (decodedState.csrfToken !== decodedStored.csrfToken) {
    return redirect('/login?error=csrf_mismatch');
  }

  if (decodedState.provider !== 'google') {
    return redirect('/login?error=provider_mismatch');
  }

  cookies.delete('oauth_state', { path: '/' });

  const user: SessionUser | null = await exchangeGoogleCode(code);
  if (!user) {
    return redirect('/login?error=auth_failed');
  }

  await setSession(context, user);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/dashboard',
    },
  });
};
