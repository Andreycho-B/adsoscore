import type { APIRoute } from 'astro';
import { exchangeGitHubCode, validateOAuthState, setSession } from '../../../../lib/auth';
import type { SessionUser } from '../../../../lib/auth';

export const GET: APIRoute = async (context) => {
  const { url, redirect, cookies } = context;

  try {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return redirect('/login?error=missing_params');
    }

    const storedState = cookies.get('oauth_state')?.value;
    if (!storedState) {
      return redirect('/login?error=missing_state');
    }

    const decodedState = await validateOAuthState(state);
    const decodedStored = await validateOAuthState(storedState);

    if (!decodedState || !decodedStored) {
      return redirect('/login?error=invalid_state');
    }

    if (decodedState.csrfToken !== decodedStored.csrfToken) {
      return redirect('/login?error=csrf_mismatch');
    }

    if (decodedState.provider !== 'github') {
      return redirect('/login?error=provider_mismatch');
    }

    cookies.delete('oauth_state', { path: '/' });

    const user: SessionUser | null = await exchangeGitHubCode(code);
    if (!user) {
      return redirect('/login?error=auth_failed');
    }

    await setSession(context, user);

    return redirect('/dashboard');
  } catch (error) {
    console.error('GitHub callback error:', error instanceof Error ? error.message : 'Unknown error');
    return redirect('/login?error=internal');
  }
};
