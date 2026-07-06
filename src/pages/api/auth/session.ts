import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';

export const GET: APIRoute = async (context) => {
  const session = getSession(context);
  return new Response(JSON.stringify(session), {
    headers: { 'Content-Type': 'application/json' },
  });
};
