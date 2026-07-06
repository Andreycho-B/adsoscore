import type { APIRoute } from 'astro';
import { clearSession } from '../../../lib/auth';

export const GET: APIRoute = async (context) => {
  clearSession(context);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
    },
  });
};
