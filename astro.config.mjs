// @ts-check
import { defineConfig } from 'astro/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      external: [
        '@prisma/client',
        '@prisma/adapter-pg',
        '.prisma/client',
      ],
    },
  },
  integrations: [react()],
});
