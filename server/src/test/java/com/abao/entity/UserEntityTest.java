package com.abao.entity;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class UserEntityTest {

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void shouldCreateUserWithRequiredFields() {
        // TDD: Test user entity creation with required fields
        User user = new User();
        user.setEmail("test@example.com");
        user.setPasswordHash("hashedPassword123");

        User savedUser = entityManager.persistAndFlush(user);

        assertThat(savedUser.getId()).isNotNull();
        assertThat(savedUser.getEmail()).isEqualTo("test@example.com");
        assertThat(savedUser.getPasswordHash()).isEqualTo("hashedPassword123");
        assertThat(savedUser.getCreatedAt()).isNotNull();
    }

    @Test
    void shouldCreateUserWithOptionalFields() {
        User user = new User();
        user.setEmail("test@example.com");
        user.setPasswordHash("hashedPassword123");
        user.setNickname("TestUser");
        user.setAvatarUrl("https://example.com/avatar.png");

        User savedUser = entityManager.persistAndFlush(user);

        assertThat(savedUser.getNickname()).isEqualTo("TestUser");
        assertThat(savedUser.getAvatarUrl()).isEqualTo("https://example.com/avatar.png");
    }

    @Test
    void emailShouldBeUnique() {
        User user1 = new User();
        user1.setEmail("duplicate@example.com");
        user1.setPasswordHash("hash1");
        entityManager.persistAndFlush(user1);

        User user2 = new User();
        user2.setEmail("duplicate@example.com");
        user2.setPasswordHash("hash2");

        org.junit.jupiter.api.Assertions.assertThrows(
            Exception.class,
            () -> entityManager.persistAndFlush(user2)
        );
    }
}
