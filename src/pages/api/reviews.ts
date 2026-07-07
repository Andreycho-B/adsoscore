import type { APIRoute } from 'astro';
import { prisma } from '../../lib/prisma';
import { getSession } from '../../lib/auth';

export const GET: APIRoute = async ({ url }) => {
  try {
    const offerId = url.searchParams.get('offerId');
    if (!offerId) {
      return new Response(JSON.stringify({ error: 'offerId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const reviews = await prisma.review.findMany({
      where: { offerId },
      include: {
        user: {
          select: { name: true, image: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return new Response(JSON.stringify({ reviews }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
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
    const { offerId, rating, content } = body as {
      offerId: string;
      rating: number;
      content: string;
    };

    if (!offerId || !rating || content === undefined) {
      return new Response(
        JSON.stringify({ error: 'offerId, rating, and content are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return new Response(
        JSON.stringify({ error: 'rating must be an integer between 1 and 5' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (content.length > 2000) {
      return new Response(
        JSON.stringify({ error: 'content must be 2000 characters or less' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const existingReview = await prisma.review.findUnique({
      where: {
        userId_offerId: {
          userId: session.user.id,
          offerId,
        },
      },
    });

    if (existingReview) {
      return new Response(
        JSON.stringify({ error: 'You have already reviewed this offer' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { createdAt: true },
    });

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (user.createdAt > sevenDaysAgo) {
      return new Response(
        JSON.stringify({
          error: 'You must be on the platform for at least 7 days to create a review',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyReviewCount = await prisma.review.count({
      where: {
        userId: session.user.id,
        createdAt: { gte: startOfMonth },
      },
    });

    if (monthlyReviewCount >= 3) {
      return new Response(
        JSON.stringify({
          error: 'You can only create up to 3 reviews per month',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const review = await prisma.review.create({
      data: {
        userId: session.user.id,
        offerId,
        rating,
        content,
      },
      include: {
        user: {
          select: { name: true, image: true },
        },
      },
    });

    return new Response(JSON.stringify({ review }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating review:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async (context) => {
  try {
    const session = await getSession(context);
    if (!session.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await context.request.json();
    const { reviewId, rating, content } = body as {
      reviewId: string;
      rating: number;
      content: string;
    };

    if (!reviewId || !rating || content === undefined) {
      return new Response(
        JSON.stringify({ error: 'reviewId, rating, and content are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return new Response(
        JSON.stringify({ error: 'rating must be an integer between 1 and 5' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (content.length > 2000) {
      return new Response(
        JSON.stringify({ error: 'content must be 2000 characters or less' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const existingReview = await prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!existingReview) {
      return new Response(JSON.stringify({ error: 'Review not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (existingReview.userId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const review = await prisma.review.update({
      where: { id: reviewId },
      data: { rating, content },
      include: {
        user: {
          select: { name: true, image: true },
        },
      },
    });

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

    let reviewId: string | undefined;

    if (context.request.method === 'DELETE') {
      const url = new URL(context.request.url);
      reviewId = url.searchParams.get('reviewId') ?? undefined;

      if (!reviewId) {
        const body = await context.request.json().catch(() => null);
        if (body) {
          reviewId = (body as { reviewId?: string }).reviewId;
        }
      }
    }

    if (!reviewId) {
      return new Response(JSON.stringify({ error: 'reviewId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existingReview = await prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!existingReview) {
      return new Response(JSON.stringify({ error: 'Review not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (existingReview.userId !== session.user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await prisma.review.delete({ where: { id: reviewId } });

    return new Response(JSON.stringify({ success: true }), {
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
