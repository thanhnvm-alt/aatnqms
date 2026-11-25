import nodemailer from 'nodemailer';

interface SendResetEmailResult {
  success: boolean;
  sent: boolean;
  error?: string;
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendPasswordResetEmail(
  toEmail: string,
  userName: string,
  otpCode: string
): Promise<SendResetEmailResult> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `"AA Corporation QMS" <${user || 'no-reply@aacorporation.com'}>`;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (!host || !user || !pass) {
    console.warn(`[emailService] SMTP chưa được cấu hình đầy đủ trong biến môi trường. Mã OTP cho [${toEmail}] là: ${otpCode}`);
    return {
      success: true,
      sent: false,
      error: 'SMTP chưa được cấu hình. Mã OTP đã được lưu trên máy chủ.',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized: false, // Hỗ trợ chứng chỉ nội bộ công ty nếu có
      },
    });

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #1e3a8a; padding: 24px 32px; text-align: left;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">AA CORPORATION</h1>
          <p style="color: #93c5fd; margin: 4px 0 0; font-size: 13px; font-weight: 500;">QMS v3.1.0 • HỆ THỐNG QUẢN LÝ CHẤT LƯỢNG</p>
        </div>
        <div style="padding: 32px; color: #1e293b;">
          <h2 style="margin: 0 0 16px; font-size: 17px; font-weight: 700; color: #0f172a;">Yêu Cầu Khôi Phục Mật Khẩu</h2>
          <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">
            Xin chào <strong>${userName || 'Quý nhân viên'}</strong>,
          </p>
          <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
            Hệ thống QMS nhận được yêu cầu thiết lập lại mật khẩu đăng nhập cho tài khoản của bạn. Vui lòng sử dụng mã xác thực (OTP) dưới đây để hoàn tất:
          </p>
          <div style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 24px;">
            <span style="font-family: 'JetBrains Mono', Consolas, Monaco, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #2563eb;">
              ${otpCode}
            </span>
            <p style="margin: 8px 0 0; font-size: 12px; color: #64748b; font-weight: 500;">Mã có hiệu lực trong vòng 15 phút</p>
          </div>
          <p style="margin: 0 0 12px; font-size: 13px; line-height: 1.6; color: #64748b;">
            ⚠️ <em>Tuyệt đối không chia sẻ mã này cho bất kỳ ai để bảo vệ an toàn tài khoản nội bộ.</em>
          </p>
          <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #64748b;">
            Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email hoặc thông báo ngay cho Quản trị viên hệ thống.
          </p>
        </div>
        <div style="background-color: #f1f5f9; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8;">
          Email tự động từ Hệ thống QMS AA Corporation. Vui lòng không trả lời thư này.
        </div>
      </div>
    `;

    await transporter.sendMail({
      from,
      to: toEmail,
      subject: `[AA Corporation QMS] Mã xác thực khôi phục mật khẩu: ${otpCode}`,
      text: `Xin chào ${userName},\n\nMã xác thực (OTP) khôi phục mật khẩu của bạn là: ${otpCode}\nMã có hiệu lực trong 15 phút.\n\nNếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua thư này.`,
      html: htmlContent,
    });

    console.log(`✅ [emailService] Đã gửi email xác thực khôi phục mật khẩu thành công tới ${toEmail}`);
    return { success: true, sent: true };
  } catch (err: any) {
    console.error(`❌ [emailService] Lỗi gửi email tới ${toEmail}:`, err.message);
    return { success: false, sent: false, error: err.message };
  }
}
