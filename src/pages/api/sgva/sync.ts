import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { loginToSGVA, fetchOffersFromSGVA, type SGVAOffer } from '../../../lib/sgva';

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

    for (const offer of offers) {
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
        fechaPublicacion: parseDate(offer.fecha_creacion),
        fechaCierre: parseDate(offer.fecha_cierre),
      };

      const existing = await prisma.offer.findUnique({
        where: { sgvaId: offer.id },
        select: { id: true },
      });

      if (existing) {
        await prisma.offer.update({
          where: { id: existing.id },
          data: { ...data, isActive: true },
        });
        updated++;
      } else {
        await prisma.offer.create({ data });
        created++;
      }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { especialidadId },
    });

    return new Response(
      JSON.stringify({
        total: offers.length,
        created,
        updated,
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
