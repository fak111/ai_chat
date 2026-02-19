import { logger } from '../utils/logger.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verifyUrl = `${BASE_URL}/api/auth/verify?token=${token}`;

  if (!RESEND_API_KEY) {
    logger.info({ email, verifyUrl }, '开发模式 - 验证链接（未配置 RESEND_API_KEY）');
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'noreply@abao.app',
      to: [email],
      subject: '验证您的A宝账号',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: sans-serif;">
          <h2>验证您的邮箱</h2>
          <p>点击下方按钮验证您的A宝账号：</p>
          <a href="${verifyUrl}"
             style="display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">
            验证邮箱
          </a>
          <p style="margin-top: 20px; color: #666; font-size: 14px;">
            如果按钮无法点击，请复制以下链接到浏览器：<br/>
            <a href="${verifyUrl}">${verifyUrl}</a>
          </p>
          <p style="color: #999; font-size: 12px;">此链接24小时内有效。如非本人操作，请忽略此邮件。</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ status: response.status, body }, '发送验证邮件失败');
    throw new Error('发送验证邮件失败');
  }

  logger.info({ email }, '验证邮件已发送');
}
