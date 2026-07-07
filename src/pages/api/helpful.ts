import type { APIRoute } from 'astro';
import { prisma } from '../../lib/prisma';
import { getSession } from '../../lib/auth';

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
    const { reviewId, isHelpful } = body as { reviewId: string; isHelpful: boolean };

    if (!reviewId || typeof isHelpful !== 'boolean') {
      return new Response(JSON.stringify({ error: 'reviewId and isHelpful are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      return new Response(JSON.stringify({ error: 'Review not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await prisma.helpfulVote.findUnique({
      where: {
        userId_reviewId: {
          userId: session.user.id,
          reviewId,
        },
      },
    });

    if (existing) {
      if (existing.isHelpful === isHelpful) {
        await prisma.helpfulVote.delete({ where: { id: existing.id } });
        await prisma.review.update({
          where: { id: reviewId },
          data: isHelpful
            ? { helpfulCount: { decrement: 1 } }
            : { notHelpfulCount: { decrement: 1 } },
        });
        return new Response(JSON.stringify({ voted: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await prisma.helpfulVote.update({
        where: { id: existing.id },
        data: { isHelpful },
      });
      await prisma.review.update({
        where: { id: reviewId },
        data: isHelpful
          ? { helpfulCount: { increment: 1 }, notHelpfulCount: { decrement: 1 } }
          : { helpfulCount: { decrement: 1 }, notHelpfulCount: { increment: 1 } },
      });
      return new Response(JSON.stringify({ voted: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await prisma.helpfulVote.create({
      data: {
        userId: session.user.id,
        reviewId,
        isHelpful,
      },
    });
    await prisma.review.update({
      where: { id: reviewId },
      data: isHelpful
        ? { helpfulCount: { increment: 1 } }
        : { notHelpfulCount: { increment: 1 } },
    });

    return new Response(JSON.stringify({ voted: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error toggling helpful vote:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
