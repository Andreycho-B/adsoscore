import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';
import { enrichOfferFromGitHub } from '../../../lib/github';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { offerId } = body;

    if (!offerId || typeof offerId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'offerId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true, empresa: true, funciones: true },
    });

    if (!offer) {
      return new Response(
        JSON.stringify({ error: 'Offer not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const enriched = await enrichOfferFromGitHub(
      offer.empresa,
      offer.funciones ?? ''
    );

    await prisma.offer.update({
      where: { id: offerId },
      data: {
        scoreGitHub: enriched.githubScore,
        githubData: enriched.githubData,
      },
    });

    return new Response(
      JSON.stringify({
        offerId,
        empresa: offer.empresa,
        scoreGitHub: enriched.githubScore,
        githubData: enriched.githubData,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('GitHub enrichment error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
