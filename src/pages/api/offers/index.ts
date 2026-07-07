import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';

export const GET: APIRoute = async ({ url }) => {
  try {
    const departamento = url.searchParams.get('departamento');
    const ciudad = url.searchParams.get('ciudad');
    const modalidad = url.searchParams.get('modalidad');
    const search = url.searchParams.get('search');
    const sort = url.searchParams.get('sort') ?? 'score';
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));

    const where: Record<string, unknown> = {
      isActive: true,
      isVisible: true,
    };

    if (departamento) where.departamento = departamento;
    if (ciudad) where.ciudad = ciudad;
    if (modalidad) where.modalidad = modalidad;

    if (search) {
      where.OR = [
        { titulo: { contains: search, mode: 'insensitive' } },
        { empresa: { contains: search, mode: 'insensitive' } },
        { funciones: { contains: search, mode: 'insensitive' } },
      ];
    }

    let orderBy: Record<string, string>;
    switch (sort) {
      case 'date':
        orderBy = { fechaPublicacion: 'desc' };
        break;
      case 'empresa':
        orderBy = { empresa: 'asc' };
        break;
      default:
        orderBy = { score: 'desc' };
    }

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          sgvaId: true,
          titulo: true,
          empresa: true,
          ciudad: true,
          departamento: true,
          modalidad: true,
          score: true,
          scoreGitHub: true,
          scoreFunciones: true,
          scoreRUES: true,
          scoreUbicacion: true,
          scoreModalidad: true,
          scoreResenas: true,
          scoreLinkedIn: true,
          scoreTamano: true,
          scoreAntiguedad: true,
          fechaPublicacion: true,
          fechaCierre: true,
        },
      }),
      prisma.offer.count({ where }),
    ]);

    return new Response(
      JSON.stringify({
        offers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error fetching offers:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
