package com.abao.controller;

import com.abao.dto.UserDto;
import com.abao.dto.auth.*;
import com.abao.entity.User;
import com.abao.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        RegisterResponse response = authService.register(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/verify")
    public ResponseEntity<Map<String, String>> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        authService.verifyEmail(request);
        return ResponseEntity.ok(Map.of("message", "邮箱验证成功"));
    }

    /**
     * GET 验证邮箱 - 浏览器点击邮件链接直接访问
     */
    @GetMapping("/verify")
    public ResponseEntity<String> verifyEmailViaLink(@RequestParam String token) {
        try {
            VerifyEmailRequest request = new VerifyEmailRequest();
            request.setToken(token);
            authService.verifyEmail(request);
            return ResponseEntity.ok()
                .header("Content-Type", "text/html; charset=UTF-8")
                .body(buildResultHtml("验证成功", "您的邮箱已成功验证，现在可以登录 A宝 了！", true));
        } catch (Exception e) {
            return ResponseEntity.ok()
                .header("Content-Type", "text/html; charset=UTF-8")
                .body(buildResultHtml("验证失败", e.getMessage(), false));
        }
    }

    private String buildResultHtml(String title, String message, boolean success) {
        String color = success ? "#52c41a" : "#ff4d4f";
        String icon = success ? "&#10004;" : "&#10008;";
        return """
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>%s - A宝</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                           display: flex; justify-content: center; align-items: center; min-height: 100vh;
                           margin: 0; background: #f5f5f5; }
                    .card { background: white; border-radius: 12px; padding: 48px; text-align: center;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; }
                    .icon { font-size: 64px; color: %s; margin-bottom: 16px; }
                    .title { font-size: 24px; font-weight: bold; margin-bottom: 8px; }
                    .message { color: #666; font-size: 16px; line-height: 1.6; }
                    .logo { font-size: 20px; color: #1890FF; font-weight: bold; margin-top: 32px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">%s</div>
                    <div class="title">%s</div>
                    <div class="message">%s</div>
                    <div class="logo">A宝</div>
                </div>
            </body>
            </html>
            """.formatted(title, color, icon, title, message);
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refreshToken(@Valid @RequestBody RefreshTokenRequest request) {
        TokenResponse response = authService.refreshToken(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(@RequestBody Map<String, String> request) {
        String refreshToken = request.get("refreshToken");
        if (refreshToken != null) {
            authService.logout(refreshToken);
        }
        return ResponseEntity.ok(Map.of("message", "登出成功"));
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> getCurrentUser(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(authService.getCurrentUser(user));
    }
}
