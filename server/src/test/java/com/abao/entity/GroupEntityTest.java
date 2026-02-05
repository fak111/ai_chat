package com.abao.entity;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class GroupEntityTest {

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void shouldCreateGroupWithRequiredFields() {
        Group group = new Group();
        group.setName("Test Group");
        group.setInviteCode("ABC123");

        Group savedGroup = entityManager.persistAndFlush(group);

        assertThat(savedGroup.getId()).isNotNull();
        assertThat(savedGroup.getName()).isEqualTo("Test Group");
        assertThat(savedGroup.getInviteCode()).isEqualTo("ABC123");
        assertThat(savedGroup.getCreatedAt()).isNotNull();
    }

    @Test
    void inviteCodeShouldBeUnique() {
        Group group1 = new Group();
        group1.setName("Group 1");
        group1.setInviteCode("SAME123");
        entityManager.persistAndFlush(group1);

        Group group2 = new Group();
        group2.setName("Group 2");
        group2.setInviteCode("SAME123");

        org.junit.jupiter.api.Assertions.assertThrows(
            Exception.class,
            () -> entityManager.persistAndFlush(group2)
        );
    }
}
