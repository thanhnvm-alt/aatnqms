import { createClient, Client } from "@libsql/client/web";

/**
 * TURSO DATABASE CONFIGURATION - WEB OPTIMIZED
 * Cấu hình được tối ưu cho môi trường trình duyệt, sử dụng HTTPS thay vì protocol libsql://
 */

const FALLBACK_URL = 'https://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io';
const FALLBACK_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA';

// Lấy giá trị từ environment variables (được Vite tiêm vào)
const envUrl = process.env.TURSO_DATABASE_URL;
const envToken = process.env.TURSO_AUTH_TOKEN;

const normalizeUrl = (url: string | undefined, fallback: string): string => {
    if (!url || url === "undefined" || url === "null" || url.trim() === "") return fallback;
    let normalized = url.trim();
    // Web client yêu cầu https:// để fetch hoạt động bình thường
    if (normalized.startsWith("libsql://")) {
        normalized = normalized.replace("libsql://", "https://");
    }
    // Đảm bảo không có dấu gạch chéo cuối
    return normalized.replace(/\/$/, "");
};

const normalizeToken = (token: string | undefined, fallback: string): string => {
    if (!token || token === "undefined" || token === "null" || token.trim() === "") return fallback;
    return token.trim();
};

const finalUrl = normalizeUrl(envUrl, FALLBACK_URL);
const finalToken = normalizeToken(envToken, FALLBACK_TOKEN);

export const isTursoConfigured = finalUrl.length > 0 && !finalUrl.includes("placeholder");

if (isTursoConfigured) {
  console.log("📡 Turso DB connecting to:", finalUrl);
}

// Khởi tạo client Turso sử dụng fetch API của trình duyệt
export const turso: Client = createClient({
  url: finalUrl,
  authToken: finalToken,
});
