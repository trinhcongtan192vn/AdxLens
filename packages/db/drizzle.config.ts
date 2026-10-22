import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: process.env.DRIZZLE_OUT ?? './migrations',
  schemaFilter: ['app', 'analytics'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres',
  },
  strict: true,
  verbose: false,
});
