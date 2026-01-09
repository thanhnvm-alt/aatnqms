
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("CRITICAL: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is missing in server environment.");
}

export const turso = createClient({
  url: url || 'libsql://placeholder-db.turso.io',
  authToken: authToken || 'placeholder-token',
});

export const isTursoConfigured = !!(url && authToken);
