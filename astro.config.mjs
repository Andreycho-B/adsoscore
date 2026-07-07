// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';

import node from '@astrojs/node';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  output: 'server',
  server: {
    host: '0.0.0.0',
    port: 4321,
    open: false,
  },
  adapter: node({
    mode: 'standalone',
  }),
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
