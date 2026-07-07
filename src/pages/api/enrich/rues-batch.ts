import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';
import { validateRUES } from '../../../lib/rues';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BatchResult {
  offerId: string;
  nit: string | null;
  ruesActivo: boolean;
  ruesScore: number;
  ruesData: Record<string, unknown> | null;
  error?: string;
}

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
      select: { id: true, nit: true },
    });

    const offerMap = new Map<string, { id: string; nit: string | null }>(offers.map((o: { id: string; nit: string | null }) => [o.id, o]));
    const results: BatchResult[] = [];

    for (const offerId of offerIds) {
      const offer = offerMap.get(offerId);

      if (!offer) {
        results.push({
          offerId,
          nit: null,
          ruesActivo: false,
          ruesScore: 0,
          ruesData: null,
          error: 'Offer not found',
        });
        continue;
      }

      if (!offer.nit) {
        results.push({
          offerId,
          nit: null,
          ruesActivo: false,
          ruesScore: 0,
          ruesData: null,
          error: 'No NIT available',
        });
        continue;
      }

      try {
        const result = await validateRUES(offer.nit);
        const ruesScore = result.ruesActivo ? 10 : 0;

        await prisma.offer.update({
          where: { id: offerId },
          data: {
            scoreRUES: ruesScore,
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

        results.push({
          offerId,
          nit: offer.nit,
          ruesActivo: result.ruesActivo,
          ruesScore,
          ruesData: result as unknown as Record<string, unknown>,
        });
      } catch {
        results.push({
          offerId,
          nit: offer.nit,
          ruesActivo: false,
          ruesScore: 0,
          ruesData: null,
          error: 'RUES validation failed',
        });
      }

      if (offerIds.indexOf(offerId) < offerIds.length - 1) {
        await delay(500);
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in RUES batch enrichment:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
