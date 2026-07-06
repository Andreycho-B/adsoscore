import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';

export const POST: APIRoute = async ({ request, cookies }) => {
  const formData = await request.formData();
  const provider = formData.get('provider') as string;

  if (provider !== 'google' && provider !== 'github') {
    return new Response(JSON.stringify({ error: 'Invalid provider' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // In a real implementation, this would redirect to OAuth provider
  // For now, we'll create a simple session mechanism
  const sessionId = crypto.randomUUID();
  
  cookies.set('session', sessionId, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return new Response(JSON.stringify({ success: true, provider }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
