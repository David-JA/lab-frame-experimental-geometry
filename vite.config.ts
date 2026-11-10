import { defineConfig } from 'vitest/config';
export default defineConfig({ base: process.env.PAGES_BASE_PATH??'/', test: { include: ['tests/**/*.test.ts'] }, server: { host: '127.0.0.1' } });
