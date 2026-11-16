import { defineConfig } from 'drizzle-kit';

// Generates the SQL migrations in ./drizzle from the schema. They are applied when the app
// starts (see src/lib/db/index.ts), to PGlite in development or to your Postgres server.
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
});
