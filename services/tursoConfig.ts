import { createClient, Client } from "@libsql/client/web";

/**
 * TURSO DATABASE CONFIGURATION - WEB OPTIMIZED
 */

const FALLBACK_URL = 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io';
const FALLBACK_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA';

// Lấy giá trị từ môi trường, ưu tiên các biến hệ thống
const envUrl = process.env.TURSO_DATABASE_URL || process.env.VITE_TURSO_DATABASE_URL;
const envToken = process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN;

const getSafeValue = (val: any, fallback: string) => {
    if (!val || val === "undefined" || val === "null" || String(val).trim() === "") return fallback;
    return String(val).trim();
};

let rawUrl = getSafeValue(envUrl, FALLBACK_URL);
let authToken = getSafeValue(envToken, FALLBACK_TOKEN);

// CRITICAL: Web client trình duyệt yêu cầu https:// thay vì libsql:// 
// để tránh lỗi "Failed to fetch" (do trình duyệt không hiểu protocol libsql)
let finalUrl = rawUrl;
if (finalUrl.startsWith("libsql://")) {
    finalUrl = finalUrl.replace("libsql://", "https://");
}

// Xóa trailing slash nếu có
finalUrl = finalUrl.replace(/\/$/, "");

export const isTursoConfigured = finalUrl.length > 0 && !finalUrl.includes("placeholder");

if (isTursoConfigured) {
  console.log("📡 Turso DB connecting to:", finalUrl.substring(0, 20) + "...");
}

export const turso: Client = createClient({
  url: finalUrl, 
  authToken: authToken,
  intMode: "number", 
});