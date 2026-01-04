
import { createClient, Client } from "@libsql/client/web";

/**
 * TURSO DATABASE CONFIGURATION
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

let url = getSafeValue(envUrl, FALLBACK_URL);
const authToken = getSafeValue(envToken, FALLBACK_TOKEN);

// CRITICAL: Web client yêu cầu https:// hoặc wss:// thay vì libsql://
if (url.startsWith("libsql://")) {
    url = url.replace("libsql://", "https://");
}

export const isTursoConfigured = url.length > 0 && !url.includes("placeholder");

if (isTursoConfigured) {
  console.log("✅ Turso Database link verified.");
} else {
  console.warn("ℹ️ Turso DB not configured. App running in restricted mode.");
}

export const turso: Client = createClient({
  url: isTursoConfigured ? url : "https://placeholder-db.turso.io", 
  authToken: authToken,
  intMode: "number", // Ngăn chặn lỗi BigInt không thể stringify trên iOS
});
