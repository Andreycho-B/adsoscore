import type { APIRoute } from 'astro';
import { getGitHubAuthURL } from '../../../../lib/auth';

export const GET: APIRoute = async () => {
  const url = getGitHubAuthURL();
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
};
