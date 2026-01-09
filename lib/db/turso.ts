
import { createClient } from "@libsql/client";

// Use environment variables if available, otherwise fall back to the demo database
const url = process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io';
const authToken = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA';

if (!url || !authToken) {
  console.error("CRITICAL: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is missing in server environment.");
}

export const turso = createClient({
  url: url,
  authToken: authToken,
});

export const isTursoConfigured = !!(url && authToken);
