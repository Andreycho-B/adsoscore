import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';

async function isAdmin(email: string | null): Promise<boolean> {
  if (!email) return false;
  const adminConfig = await prisma.systemConfig.findUnique({ where: { key: 'adminEmail' } });
  return email === adminConfig?.value || email === 'admin@adsoscore.dev';
}

export const GET: APIRoute = async (context) => {
  const session = await getSession(context);
  if (!session.user || !(await isAdmin(session.user.email))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const entries = await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
  return new Response(JSON.stringify({ configs: entries }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async (context) => {
  const session = await getSession(context);
  if (!session.user || !(await isAdmin(session.user.email))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await context.request.json();
  const { key, value } = body;

  if (!key || typeof value !== 'string') {
    return new Response(JSON.stringify({ error: 'key and value are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const entry = await prisma.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  return new Response(JSON.stringify({ config: entry }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
