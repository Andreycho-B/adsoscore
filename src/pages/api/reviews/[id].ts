import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';

export const PATCH: APIRoute = async (context) => {
  try {
    const session = await getSession(context);
    if (!session.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Review ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await prisma.review.findUnique({ where: { id } });
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Review not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (existing.userId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await context.request.json();
    const { rating, content } = body as { rating?: number; content?: string };

    const data: Record<string, unknown> = {};
    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return new Response(JSON.stringify({ error: 'Rating must be between 1 and 5' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      data.rating = rating;
    }
    if (content !== undefined) {
      data.content = content.trim().slice(0, 2000);
    }

    const review = await prisma.review.update({ where: { id }, data });

    return new Response(JSON.stringify({ review }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating review:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const session = await getSession(context);
    if (!session.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Review ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await prisma.review.findUnique({ where: { id } });
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Review not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (existing.userId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await prisma.review.delete({ where: { id } });

    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
