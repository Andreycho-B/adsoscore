import type { APIRoute } from 'astro';
import { prisma } from '../../lib/prisma';
import { getSession } from '../../lib/auth';

export const GET: APIRoute = async (context) => {
  try {
    const session = await getSession(context);
    if (!session.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const favorites = await prisma.favorite.findMany({
      where: { userId: session.user.id },
      include: { offer: true },
    });

    return new Response(JSON.stringify({ favorites }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const session = await getSession(context);
    if (!session.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await context.request.json();
    const { offerId } = body as { offerId: string };

    if (!offerId) {
      return new Response(JSON.stringify({ error: 'offerId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await prisma.favorite.findUnique({
      where: {
        userId_offerId: {
          userId: session.user.id,
          offerId,
        },
      },
    });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return new Response(JSON.stringify({ favorited: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await prisma.favorite.create({
      data: {
        userId: session.user.id,
        offerId,
      },
    });

    return new Response(JSON.stringify({ favorited: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
