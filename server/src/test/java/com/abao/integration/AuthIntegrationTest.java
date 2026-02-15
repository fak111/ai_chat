package com.abao.integration;

import com.abao.dto.auth.LoginRequest;
import com.abao.dto.auth.RegisterRequest;
import com.abao.entity.RefreshToken;
import com.abao.entity.User;
import com.abao.repository.RefreshTokenRepository;
import com.abao.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    /**
     * 注册 → 验证邮箱 → 登录，完整流程
     */
    @Test
    void registerAndLogin_Success() throws Exception {
        String email = "test" + System.currentTimeMillis() + "@example.com";
        String password = "Password123!";

        // 1. Register - 返回验证邮件提示，不返回 token
        RegisterRequest registerRequest = new RegisterRequest();
        registerRequest.setEmail(email);
        registerRequest.setPassword(password);
        registerRequest.setNickname("TestUser");

        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(registerRequest)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").exists())
            .andExpect(jsonPath("$.email").value(email));

        // 2. 手动验证邮箱（模拟用户点击验证链接）
        User user = userRepository.findByEmail(email).orElseThrow();
        user.setEmailVerified(true);
        user.setVerificationToken(null);
        userRepository.save(user);

        // 3. Login - 验证后才能登录
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail(email);
        loginRequest.setPassword(password);

        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").exists())
            .andExpect(jsonPath("$.user.email").value(email));
    }

    @Test
    void login_InvalidCredentials_ReturnsUnauthorized() throws Exception {
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("nonexistent@example.com");
        loginRequest.setPassword("wrongpassword");

        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void accessProtectedEndpoint_WithoutToken_ReturnsForbidden() throws Exception {
        // Spring Security 无自定义 AuthenticationEntryPoint 时，未认证请求返回 403
        mockMvc.perform(get("/api/groups"))
            .andExpect(status().isForbidden());
    }

    @Test
    void accessProtectedEndpoint_WithValidToken_ReturnsOk() throws Exception {
        String email = "tokentest" + System.currentTimeMillis() + "@example.com";
        String password = "Password123!";

        // 1. Register
        RegisterRequest registerRequest = new RegisterRequest();
        registerRequest.setEmail(email);
        registerRequest.setPassword(password);
        registerRequest.setNickname("TokenTest");

        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(registerRequest)))
            .andExpect(status().isOk());

        // 2. 手动验证邮箱
        User user = userRepository.findByEmail(email).orElseThrow();
        user.setEmailVerified(true);
        user.setVerificationToken(null);
        userRepository.save(user);

        // 3. Login 获取 token
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail(email);
        loginRequest.setPassword(password);

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
            .andExpect(status().isOk())
            .andReturn();

        String accessToken = objectMapper.readTree(loginResult.getResponse().getContentAsString())
            .get("accessToken").asText();

        // 4. 用 token 访问受保护端点
        mockMvc.perform(get("/api/groups")
                .header("Authorization", "Bearer " + accessToken))
            .andExpect(status().isOk());
    }

    @Test
    void verifyEmailViaGetRequest_WithValidToken_ReturnsHtmlSuccessPage() throws Exception {
        String email = "getverify" + System.currentTimeMillis() + "@example.com";
        RegisterRequest registerRequest = new RegisterRequest();
        registerRequest.setEmail(email);
        registerRequest.setPassword("Password123!");
        registerRequest.setNickname("GetVerifyUser");

        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(registerRequest)))
            .andExpect(status().isOk());

        User user = userRepository.findByEmail(email).orElseThrow();
        assertThat(user.getEmailVerified()).isFalse();
        String token = user.getVerificationToken();
        assertThat(token).isNotBlank();

        mockMvc.perform(get("/api/auth/verify").param("token", token))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("验证成功")));

        User verifiedUser = userRepository.findByEmail(email).orElseThrow();
        assertThat(verifiedUser.getEmailVerified()).isTrue();
        assertThat(verifiedUser.getVerificationToken()).isNull();
    }

    @Test
    void verifyEmailViaGetRequest_WithInvalidToken_ReturnsHtmlErrorPage() throws Exception {
        mockMvc.perform(get("/api/auth/verify").param("token", UUID.randomUUID().toString()))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("验证失败")));
    }

    @Test
    void refreshToken_WithExpiredRefreshToken_Returns401() throws Exception {
        String email = "expired-refresh" + System.currentTimeMillis() + "@example.com";
        String password = "Password123!";

        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setEmailVerified(true);
        userRepository.save(user);

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail(email);
        loginRequest.setPassword(password);

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
            .andExpect(status().isOk())
            .andReturn();

        String responseBody = loginResult.getResponse().getContentAsString();
        String refreshToken = objectMapper.readTree(responseBody).get("refreshToken").asText();

        RefreshToken storedToken = refreshTokenRepository.findByToken(refreshToken)
            .orElseThrow();
        storedToken.setExpiresAt(LocalDateTime.now().minusHours(1));
        refreshTokenRepository.save(storedToken);

        mockMvc.perform(post("/api/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", refreshToken))))
            .andExpect(status().isUnauthorized());
    }
}
