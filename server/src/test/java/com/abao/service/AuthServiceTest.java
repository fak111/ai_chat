package com.abao.service;

import com.abao.dto.auth.*;
import com.abao.entity.RefreshToken;
import com.abao.entity.User;
import com.abao.repository.UserRepository;
import com.abao.repository.RefreshTokenRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AuthServiceTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void setUp() {
        refreshTokenRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void shouldRegisterNewUser() {
        RegisterRequest request = new RegisterRequest();
        request.setEmail("newuser@example.com");
        request.setPassword("Password123");
        request.setNickname("NewUser");

        RegisterResponse response = authService.register(request);

        assertThat(response.getMessage()).contains("验证邮件");

        User savedUser = userRepository.findByEmail("newuser@example.com").orElseThrow();
        assertThat(savedUser.getEmail()).isEqualTo("newuser@example.com");
        assertThat(savedUser.getNickname()).isEqualTo("NewUser");
        assertThat(savedUser.getEmailVerified()).isFalse();
        assertThat(passwordEncoder.matches("Password123", savedUser.getPasswordHash())).isTrue();
    }

    @Test
    void shouldRejectDuplicateEmail() {
        RegisterRequest request = new RegisterRequest();
        request.setEmail("duplicate@example.com");
        request.setPassword("Password123");

        authService.register(request);

        RegisterRequest duplicateRequest = new RegisterRequest();
        duplicateRequest.setEmail("duplicate@example.com");
        duplicateRequest.setPassword("Password456");

        assertThrows(RuntimeException.class, () -> authService.register(duplicateRequest));
    }

    @Test
    void shouldLoginWithValidCredentials() {
        // Create verified user
        User user = new User();
        user.setEmail("login@example.com");
        user.setPasswordHash(passwordEncoder.encode("Password123"));
        user.setEmailVerified(true);
        userRepository.save(user);

        LoginRequest request = new LoginRequest();
        request.setEmail("login@example.com");
        request.setPassword("Password123");

        LoginResponse response = authService.login(request);

        assertThat(response.getAccessToken()).isNotBlank();
        assertThat(response.getRefreshToken()).isNotBlank();
        assertThat(response.getUser().getEmail()).isEqualTo("login@example.com");
    }

    @Test
    void shouldRejectInvalidPassword() {
        User user = new User();
        user.setEmail("wrongpass@example.com");
        user.setPasswordHash(passwordEncoder.encode("Password123"));
        user.setEmailVerified(true);
        userRepository.save(user);

        LoginRequest request = new LoginRequest();
        request.setEmail("wrongpass@example.com");
        request.setPassword("WrongPassword");

        assertThrows(RuntimeException.class, () -> authService.login(request));
    }

    @Test
    void shouldRejectUnverifiedEmail() {
        User user = new User();
        user.setEmail("unverified@example.com");
        user.setPasswordHash(passwordEncoder.encode("Password123"));
        user.setEmailVerified(false);
        userRepository.save(user);

        LoginRequest request = new LoginRequest();
        request.setEmail("unverified@example.com");
        request.setPassword("Password123");

        assertThrows(RuntimeException.class, () -> authService.login(request));
    }

    @Test
    void shouldRefreshToken() {
        // Create user and login first
        User user = new User();
        user.setEmail("refresh@example.com");
        user.setPasswordHash(passwordEncoder.encode("Password123"));
        user.setEmailVerified(true);
        userRepository.save(user);

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("refresh@example.com");
        loginRequest.setPassword("Password123");
        LoginResponse loginResponse = authService.login(loginRequest);

        RefreshTokenRequest refreshRequest = new RefreshTokenRequest();
        refreshRequest.setRefreshToken(loginResponse.getRefreshToken());

        TokenResponse refreshResponse = authService.refreshToken(refreshRequest);

        assertThat(refreshResponse.getAccessToken()).isNotBlank();
        assertThat(refreshResponse.getAccessToken()).isNotEqualTo(loginResponse.getAccessToken());
    }

    @Test
    void shouldRejectExpiredRefreshToken() {
        // Create user and login to get a valid refresh token
        User user = new User();
        user.setEmail("expired-refresh@example.com");
        user.setPasswordHash(passwordEncoder.encode("Password123"));
        user.setEmailVerified(true);
        userRepository.save(user);

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail("expired-refresh@example.com");
        loginRequest.setPassword("Password123");
        LoginResponse loginResponse = authService.login(loginRequest);

        // Manually expire the refresh token in DB
        RefreshToken storedToken = refreshTokenRepository
            .findByToken(loginResponse.getRefreshToken())
            .orElseThrow();
        storedToken.setExpiresAt(LocalDateTime.now().minusHours(1));
        refreshTokenRepository.save(storedToken);

        // Attempt refresh with the now-expired token
        RefreshTokenRequest refreshRequest = new RefreshTokenRequest();
        refreshRequest.setRefreshToken(loginResponse.getRefreshToken());

        assertThatThrownBy(() -> authService.refreshToken(refreshRequest))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("已过期");
    }
}
