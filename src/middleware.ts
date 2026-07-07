import { defineMiddleware } from 'astro:middleware';
import { getSession } from './lib/auth';

const PROTECTED_ROUTES = ['/dashboard', '/admin', '/favorites', '/notifications'];

export const onRequest = defineMiddleware(async (context, next) => {
  const path = new URL(context.request.url).pathname;
  const isProtected = PROTECTED_ROUTES.some((route) => path.startsWith(route));

  if (isProtected) {
    const session = await getSession(context);
    if (!session.user) {
      return context.redirect('/login');
    }
  }

  return next();
});
