import type { APIRoute } from 'astro';
import { getGoogleAuthURL } from '../../../../lib/auth';

export const GET: APIRoute = async () => {
  const url = getGoogleAuthURL();
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
};
