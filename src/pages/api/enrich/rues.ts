import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';
import { validateRUES } from '../../../lib/rues';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { offerId } = body;

    if (!offerId) {
      return new Response(
        JSON.stringify({ error: 'offerId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true, nit: true },
    });

    if (!offer) {
      return new Response(
        JSON.stringify({ error: 'Offer not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!offer.nit) {
      return new Response(
        JSON.stringify({
          offerId,
          ruesActivo: false,
          ruesScore: 0,
          ruesData: null,
          note: 'No NIT available for this offer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await validateRUES(offer.nit);

    const ruesScore = result.ruesActivo ? 10 : 0;

    const currentOffer = await prisma.offer.findUnique({
      where: { id: offerId },
      select: {
        scoreGitHub: true,
        scoreFunciones: true,
        scoreUbicacion: true,
        scoreModalidad: true,
        scoreResenas: true,
        scoreLinkedIn: true,
        scoreTamano: true,
        scoreAntiguedad: true,
      },
    });

    const subScores = currentOffer || {
      scoreGitHub: 0,
      scoreFunciones: 0,
      scoreUbicacion: 0,
      scoreModalidad: 0,
      scoreResenas: 0,
      scoreLinkedIn: 0,
      scoreTamano: 0,
      scoreAntiguedad: 0,
    };

    const newScore = ruesScore +
      (subScores.scoreGitHub ?? 0) +
      (subScores.scoreFunciones ?? 0) +
      (subScores.scoreUbicacion ?? 0) +
      (subScores.scoreModalidad ?? 0) +
      (subScores.scoreResenas ?? 0) +
      (subScores.scoreLinkedIn ?? 0) +
      (subScores.scoreTamano ?? 0) +
      (subScores.scoreAntiguedad ?? 0);

    await prisma.offer.update({
      where: { id: offerId },
      data: {
        scoreRUES: ruesScore,
        score: newScore,
        ruesData: {
          ruesActivo: result.ruesActivo,
          razonSocial: result.razonSocial,
          estado: result.estado,
          fechaConstitucion: result.fechaConstitucion,
          direccion: result.direccion,
          telefono: result.telefono,
          validatedAt: new Date().toISOString(),
        },
      },
    });

    return new Response(
      JSON.stringify({
        offerId,
        nit: offer.nit,
        ruesActivo: result.ruesActivo,
        ruesScore,
        ruesData: result,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error enriching offer from RUES:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
