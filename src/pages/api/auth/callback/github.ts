import type { APIRoute } from 'astro';
import { exchangeGitHubCode, setSession } from '../../../../lib/auth';

export const GET: APIRoute = async (context) => {
  const { url, redirect } = context;
  const code = url.searchParams.get('code');
  if (!code) {
    return redirect('/login?error=missing_code');
  }

  const user = await exchangeGitHubCode(code);
  if (!user) {
    return redirect('/login?error=auth_failed');
  }

  setSession(context, user);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/dashboard',
    },
  });
};
