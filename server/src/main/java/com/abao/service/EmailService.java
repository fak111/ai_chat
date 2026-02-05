package com.abao.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class EmailService {

    @Value("${email.resend.api-key:}")
    private String resendApiKey;

    @Value("${email.resend.from:noreply@abao.app}")
    private String fromEmail;

    @Value("${DOMAIN:localhost}")
    private String domain;

    private final RestTemplate restTemplate = new RestTemplate();

    public void sendVerificationEmail(String toEmail, String verificationToken) {
        if (resendApiKey == null || resendApiKey.isEmpty()) {
            log.warn("Resend API key not configured, skipping email send");
            log.info("Verification link for {}: https://{}/verify?token={}", toEmail, domain, verificationToken);
            return;
        }

        String verificationLink = String.format("https://%s/verify?token=%s", domain, verificationToken);

        Map<String, Object> emailData = new HashMap<>();
        emailData.put("from", fromEmail);
        emailData.put("to", List.of(toEmail));
        emailData.put("subject", "验证您的A宝账号");
        emailData.put("html", buildVerificationEmailHtml(verificationLink));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(resendApiKey);

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(emailData, headers);

        try {
            ResponseEntity<String> response = restTemplate.exchange(
                "https://api.resend.com/emails",
                HttpMethod.POST,
                request,
                String.class
            );

            if (response.getStatusCode().is2xxSuccessful()) {
                log.info("Verification email sent to {}", toEmail);
            } else {
                log.error("Failed to send email: {}", response.getBody());
            }
        } catch (Exception e) {
            log.error("Error sending verification email", e);
            throw new RuntimeException("发送验证邮件失败", e);
        }
    }

    private String buildVerificationEmailHtml(String verificationLink) {
        return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                    .container { max-width: 600px; margin: 0 auto; padding: 40px; }
                    .logo { font-size: 32px; font-weight: bold; color: #1890FF; margin-bottom: 24px; }
                    .button { display: inline-block; padding: 16px 32px; background: #1890FF; color: white; text-decoration: none; border-radius: 8px; font-weight: 500; }
                    .footer { margin-top: 40px; color: #8C8C8C; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo">A宝</div>
                    <h2>验证您的邮箱</h2>
                    <p>感谢您注册 A宝！请点击下方按钮验证您的邮箱地址：</p>
                    <p style="margin: 32px 0;">
                        <a href="%s" class="button">验证邮箱</a>
                    </p>
                    <p>如果按钮无法点击，请复制以下链接到浏览器：</p>
                    <p style="word-break: break-all; color: #1890FF;">%s</p>
                    <p>此链接24小时内有效。</p>
                    <div class="footer">
                        <p>如果您没有注册 A宝 账号，请忽略此邮件。</p>
                        <p>© 2026 A宝 - 让每群人都能AI聊天</p>
                    </div>
                </div>
            </body>
            </html>
            """.formatted(verificationLink, verificationLink);
    }
}
