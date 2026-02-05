package com.abao.entity;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class MessageEntityTest {

    @Autowired
    private TestEntityManager entityManager;

    private User user;
    private Group group;

    @BeforeEach
    void setUp() {
        user = new User();
        user.setEmail("sender@example.com");
        user.setPasswordHash("hash");
        user = entityManager.persistAndFlush(user);

        group = new Group();
        group.setName("Test Group");
        group.setInviteCode("TEST01");
        group = entityManager.persistAndFlush(group);
    }

    @Test
    void shouldCreateUserMessage() {
        Message message = new Message();
        message.setGroup(group);
        message.setSender(user);
        message.setContent("Hello, World!");
        message.setMessageType(MessageType.USER);

        Message savedMessage = entityManager.persistAndFlush(message);

        assertThat(savedMessage.getId()).isNotNull();
        assertThat(savedMessage.getContent()).isEqualTo("Hello, World!");
        assertThat(savedMessage.getMessageType()).isEqualTo(MessageType.USER);
        assertThat(savedMessage.getSender().getId()).isEqualTo(user.getId());
        assertThat(savedMessage.getCreatedAt()).isNotNull();
    }

    @Test
    void shouldCreateAIMessage() {
        Message message = new Message();
        message.setGroup(group);
        message.setSender(null); // AI messages have no sender
        message.setContent("I am AI response");
        message.setMessageType(MessageType.AI);

        Message savedMessage = entityManager.persistAndFlush(message);

        assertThat(savedMessage.getMessageType()).isEqualTo(MessageType.AI);
        assertThat(savedMessage.getSender()).isNull();
    }

    @Test
    void shouldCreateReplyMessage() {
        Message originalMessage = new Message();
        originalMessage.setGroup(group);
        originalMessage.setSender(user);
        originalMessage.setContent("Original message");
        originalMessage.setMessageType(MessageType.USER);
        originalMessage = entityManager.persistAndFlush(originalMessage);

        Message replyMessage = new Message();
        replyMessage.setGroup(group);
        replyMessage.setSender(user);
        replyMessage.setContent("Reply to original");
        replyMessage.setMessageType(MessageType.USER);
        replyMessage.setReplyTo(originalMessage);

        Message savedReply = entityManager.persistAndFlush(replyMessage);

        assertThat(savedReply.getReplyTo()).isNotNull();
        assertThat(savedReply.getReplyTo().getId()).isEqualTo(originalMessage.getId());
    }
}
