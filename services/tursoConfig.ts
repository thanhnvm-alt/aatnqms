
import { createClient, Client } from "@libsql/client/web";

/**
 * TURSO DATABASE CONFIGURATION - WEB OPTIMIZED
 * Khắc phục lỗi "Failed to fetch" bằng cách chuẩn hóa URL cho môi trường Browser.
 * Turso Web SDK yêu cầu URL phải bắt đầu bằng https:// hoặc wss://.
 */

const FALLBACK_URL = 'https://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io';
const FALLBACK_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA';

const getSafeValue = (envVal: any, viteVal: any, fallback: string) => {
    const val = envVal || viteVal;
    if (!val || val === "undefined" || val === "null" || String(val).trim() === "") return fallback;
    return String(val).trim();
};

let rawUrl = getSafeValue(import.meta.env.TURSO_DATABASE_URL, import.meta.env.VITE_TURSO_DATABASE_URL, FALLBACK_URL);
let authToken = getSafeValue(import.meta.env.TURSO_AUTH_TOKEN, import.meta.env.VITE_TURSO_AUTH_TOKEN, FALLBACK_TOKEN);

// Chuẩn hóa URL cho Fetch API của trình duyệt
let finalUrl = rawUrl;
if (finalUrl.startsWith("libsql://")) {
    finalUrl = finalUrl.replace("libsql://", "https://");
} else if (finalUrl.startsWith("wss://")) {
    finalUrl = finalUrl.replace("wss://", "https://");
} else if (!finalUrl.startsWith("http")) {
    finalUrl = "https://" + finalUrl;
}

// Loại bỏ dấu gạch chéo cuối cùng để tránh lỗi ghép URL
finalUrl = finalUrl.replace(/\/$/, "");

export const isTursoConfigured = finalUrl.length > 0 && !finalUrl.includes("placeholder");

if (isTursoConfigured) {
    console.log(`📡 ISO-DB: Turso Connection String standardized for Fetch API. URL: ${finalUrl}, Token: ${authToken ? 'Configured' : 'NOT Configured'}`);
}

export const turso: Client = createClient({
  url: finalUrl, 
  authToken: authToken,
});
