import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { loginToSGVA, fetchOffersFromSGVA, type SGVAOffer } from '../../../lib/sgva';
import { calculateScore, passesHardFilter, detectModalidad } from '../../../lib/scoring';

function parseDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(Number);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day);
}

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
    const { document: sgvaDocument, password } = body as {
      document: string;
      password: string;
    };

    if (!sgvaDocument || !password) {
      return new Response(
        JSON.stringify({ error: 'document and password are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { cookies, especialidadId } = await loginToSGVA(
      sgvaDocument,
      password
    );

    const offers = await fetchOffersFromSGVA(cookies, especialidadId);

    let created = 0;
    let updated = 0;
    const syncedIds: string[] = [];

    for (const offer of offers) {
      const modalidad = detectModalidad(offer.funciones || '', offer.perfil || '');
      const isRelevant = passesHardFilter({ perfil: offer.perfil || '', funciones: offer.funciones || '' });

      const cierreDate = parseDate(offer.fecha_cierre);
      const fechaCierreISO = cierreDate ? cierreDate.toISOString() : undefined;

      const { total, breakdown } = calculateScore({
        perfil: offer.perfil || '',
        funciones: offer.funciones || '',
        ciudad: offer.ciudad?.trim(),
        modalidad,
        empresa: offer.empresa,
        nit: offer.nit,
        fecha_cierre: fechaCierreISO,
      });

      const data = {
        sgvaId: offer.id,
        titulo: offer.especialidad || 'Sin titulo',
        empresa: offer.empresa || 'Sin empresa',
        nit: offer.nit || null,
        descripcion: offer.perfil || null,
        funciones: offer.funciones || null,
        perfil: offer.perfil || null,
        ciudad: offer.ciudad || null,
        departamento: offer.departamento || null,
        direccion: offer.direccion || null,
        telefono: offer.telefono || null,
        contacto: offer.contacto || null,
        email: offer.email || null,
        modalidad,
        fechaPublicacion: parseDate(offer.fecha_creacion),
        fechaCierre: cierreDate,
        score: total,
        scoreGitHub: 0,
        scoreFunciones: breakdown["funciones_ads"] ?? 0,
        scoreRUES: breakdown["rues_activo"] ?? 0,
        scoreUbicacion: breakdown["ciudad_prioritaria"] ?? 0,
        scoreModalidad: breakdown["modalidad_remota"] ?? 0,
        scoreResenas: 0,
        scoreLinkedIn: 0,
        scoreTamano: breakdown["empresa"] ?? 0,
        scoreAntiguedad: breakdown["fecha_cierre"] ?? 0,
        isRelevantForAds: isRelevant,
        isActive: true,
        isVisible: true,
      };

      const existing = await prisma.offer.findUnique({
        where: { sgvaId: offer.id },
        select: { id: true },
      });

      if (existing) {
        await prisma.offer.update({
          where: { id: existing.id },
          data,
        });
        updated++;
      } else {
        await prisma.offer.create({ data });
        created++;
      }
      syncedIds.push(offer.id);
    }

    const deactivated = await prisma.offer.updateMany({
      where: {
        sgvaId: { notIn: syncedIds },
        isActive: true,
      },
      data: { isActive: false },
    });
    console.log(`SGVA sync: ${deactivated.count} ofertas viejas desactivadas`);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { especialidadId },
    });

    return new Response(
      JSON.stringify({
        total: offers.length,
        created,
        updated,
        deactivated: deactivated.count,
        especialidadId,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('SGVA sync error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
