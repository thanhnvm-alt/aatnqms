
import { createClient, Client } from "@libsql/client/web";

/**
 * TURSO DATABASE CONFIGURATION
 * 
 * Khởi tạo kết nối đến cơ sở dữ liệu Turso (libSQL).
 * Client này hỗ trợ kết nối qua HTTP/Websockets, tương thích với Vercel (Serverless/Edge) và Browser.
 */

// Fallback values provided by user
const FALLBACK_URL = 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io';
const FALLBACK_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA';

// Safe retrieval with trimming
// Use logic to prefer Env Var, but fall back gracefully
const envUrl = process.env.TURSO_DATABASE_URL;
const envToken = process.env.TURSO_AUTH_TOKEN;

let rawUrl = (envUrl && envUrl.length > 5) ? envUrl : FALLBACK_URL;
let rawToken = (envToken && envToken.length > 10) ? envToken : FALLBACK_TOKEN;

let url = rawUrl.trim();
const authToken = rawToken.trim();

// CRITICAL FIX: Browser environments require https:// or wss://.
// The web client from @libsql/client/web uses fetch, so we MUST use https://
if (url.startsWith("libsql://")) {
    url = url.replace("libsql://", "https://");
}

// Check if URL is present and not a placeholder
export const isTursoConfigured = url.length > 0 && url !== "undefined" && url !== "null" && !url.includes("placeholder");

if (isTursoConfigured) {
  const maskedUrl = url.length > 15 ? `${url.substring(0, 15)}...` : url;
  console.log(`✅ Turso DB Configured. Endpoint: ${maskedUrl}`);
} else {
  console.log("ℹ️ Turso DB not configured. App will run in offline/mock mode.");
}

// Create client
// We use a try-catch block for the client creation just in case, though usually it doesn't throw until usage.
// CRITICAL FIX: intMode: "number" prevents BigInt return values which crash JSON.stringify on iOS/Safari
export const turso: Client = createClient({
  url: isTursoConfigured ? url : "https://placeholder-db.turso.io", 
  authToken: authToken,
  intMode: "number", 
});
