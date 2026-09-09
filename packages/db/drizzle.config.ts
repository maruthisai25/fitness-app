import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit only ever *generates* SQL here — it never connects to a database.
 * Both platforms apply the generated files through `migrate(driver)`
 * (`src/migrations/migrate.ts`), which runs over the `SqlDriver` seam so that
 * Expo, the OPFS worker and Node tests all share one migration path.
 *
 * After editing `src/schema.ts`:
 *   pnpm --filter @vigor/db migrations:generate
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './migrations',
  strict: true,
  verbose: false,
});
