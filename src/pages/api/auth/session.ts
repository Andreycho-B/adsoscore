import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ cookies }) => {
  const sessionId = cookies.get('session')?.value;

  if (!sessionId) {
    return new Response(JSON.stringify({ user: null }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // In a real implementation, this would validate the session
  // For now, we'll return a mock user
  return new Response(JSON.stringify({ 
    user: { 
      id: 'mock-user-id',
      name: 'Usuario ADSO',
      email: 'usuario@adsoscore.com',
      image: null,
    } 
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
