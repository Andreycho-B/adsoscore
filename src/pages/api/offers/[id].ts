import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';

export const GET: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Offer ID is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        reviews: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { name: true, image: true },
            },
          },
        },
        _count: {
          select: { favorites: true },
        },
      },
    });

    if (!offer) {
      return new Response(
        JSON.stringify({ error: 'Offer not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const reviewAggregate = await prisma.review.aggregate({
      where: { offerId: id },
      _count: { id: true },
      _avg: { rating: true },
    });

    const reviewSummary = {
      count: reviewAggregate._count.id,
      averageRating: reviewAggregate._avg.rating ?? 0,
    };

    return new Response(
      JSON.stringify({
        offer: {
          ...offer,
          reviewSummary,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error fetching offer:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
