import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { validateRUES } from '../../../lib/rues';
import { enrichOfferFromGitHub } from '../../../lib/github';

async function isAdmin(email: string | null): Promise<boolean> {
  if (!email) return false;
  const adminConfig = await prisma.systemConfig.findUnique({ where: { key: 'adminEmail' } });
  return email === adminConfig?.value || email === 'admin@adsoscore.dev';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const POST: APIRoute = async (context) => {
  const session = await getSession(context);
  if (!session.user || !(await isAdmin(session.user.email))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await context.request.json().catch(() => ({}));
  const batchSize = 10;

  const offers = await prisma.offer.findMany({
    where: { isActive: true },
    select: { id: true, nit: true, empresa: true, funciones: true },
  });

  const results: Array<{ offerId: string; rues?: { score: number; active: boolean }; github?: { score: number }; error?: string }> = [];

  for (let i = 0; i < offers.length; i += batchSize) {
    const batch = offers.slice(i, i + batchSize);

    for (const offer of batch) {
      const entry: typeof results[number] = { offerId: offer.id };

      if (offer.nit) {
        try {
          const ruesResult = await validateRUES(offer.nit);
          const ruesScore = ruesResult.ruesActivo ? 10 : 0;

          await prisma.offer.update({
            where: { id: offer.id },
            data: {
              scoreRUES: ruesScore,
              ruesData: {
                ruesActivo: ruesResult.ruesActivo,
                razonSocial: ruesResult.razonSocial,
                estado: ruesResult.estado,
                fechaConstitucion: ruesResult.fechaConstitucion,
                validatedAt: new Date().toISOString(),
              },
            },
          });

          entry.rues = { score: ruesScore, active: ruesResult.ruesActivo };
        } catch {
          entry.error = 'RUES failed';
        }
      }

      try {
        const githubResult = await enrichOfferFromGitHub(offer.empresa, offer.funciones ?? '');

        await prisma.offer.update({
          where: { id: offer.id },
          data: {
            scoreGitHub: githubResult.githubScore,
            githubData: githubResult.githubData,
          },
        });

        entry.github = { score: githubResult.githubScore };
      } catch {
        entry.error = entry.error ? entry.error + '; GitHub failed' : 'GitHub failed';
      }

      results.push(entry);

      if (batch.indexOf(offer) < batch.length - 1) {
        await sleep(500);
      }
    }

    if (i + batchSize < offers.length) {
      await sleep(1000);
    }
  }

  return new Response(
    JSON.stringify({
      total: offers.length,
      processed: results.length,
      results,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
