import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';
import { enrichOfferFromGitHub } from '../../../lib/github';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { offerIds } = body;

    if (!Array.isArray(offerIds) || offerIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'offerIds array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (offerIds.length > 10) {
      return new Response(
        JSON.stringify({ error: 'Maximum 10 offers per batch' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const offers = await prisma.offer.findMany({
      where: { id: { in: offerIds } },
      select: { id: true, empresa: true, funciones: true },
    });

    const results: Record<string, any> = {};

    for (let i = 0; i < offers.length; i++) {
      const offer = offers[i];

      const enriched = await enrichOfferFromGitHub(
        offer.empresa,
        offer.funciones ?? ''
      );

      const currentOffer = await prisma.offer.findUnique({
        where: { id: offer.id },
        select: {
          scoreFunciones: true,
          scoreRUES: true,
          scoreUbicacion: true,
          scoreModalidad: true,
          scoreResenas: true,
          scoreLinkedIn: true,
          scoreTamano: true,
          scoreAntiguedad: true,
        },
      });

      const subScores = currentOffer || {
        scoreFunciones: 0,
        scoreRUES: 0,
        scoreUbicacion: 0,
        scoreModalidad: 0,
        scoreResenas: 0,
        scoreLinkedIn: 0,
        scoreTamano: 0,
        scoreAntiguedad: 0,
      };

      const newScore = enriched.githubScore +
        (subScores.scoreFunciones ?? 0) +
        (subScores.scoreRUES ?? 0) +
        (subScores.scoreUbicacion ?? 0) +
        (subScores.scoreModalidad ?? 0) +
        (subScores.scoreResenas ?? 0) +
        (subScores.scoreLinkedIn ?? 0) +
        (subScores.scoreTamano ?? 0) +
        (subScores.scoreAntiguedad ?? 0);

      await prisma.offer.update({
        where: { id: offer.id },
        data: {
          scoreGitHub: enriched.githubScore,
          githubData: enriched.githubData,
          score: newScore,
        },
      });

      results[offer.id] = {
        empresa: offer.empresa,
        scoreGitHub: enriched.githubScore,
        githubData: enriched.githubData,
      };

      if (i < offers.length - 1) {
        await sleep(1000);
      }
    }

    const notFound = offerIds.filter(
      (id) => !offers.some((o: { id: string }) => o.id === id)
    );

    return new Response(
      JSON.stringify({
        results,
        notFound,
        processed: offers.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('GitHub batch enrichment error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
