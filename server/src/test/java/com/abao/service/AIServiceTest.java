package com.abao.service;

import com.abao.entity.Message;
import com.abao.entity.MessageType;
import com.abao.entity.Group;
import com.abao.entity.User;
import com.abao.repository.MessageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AIServiceTest {

    @Mock
    private MessageRepository messageRepository;

    @Mock
    private MessageService messageService;

    @Mock
    private RestTemplate restTemplate;

    @InjectMocks
    private AIService aiService;

    private Group testGroup;
    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = new User();
        testUser.setId(UUID.randomUUID());
        testUser.setNickname("TestUser");

        testGroup = new Group();
        testGroup.setId(UUID.randomUUID());
        testGroup.setName("Test Group");

        ReflectionTestUtils.setField(aiService, "apiKey", "test-api-key");
        ReflectionTestUtils.setField(aiService, "apiUrl", "https://api.deepseek.com/v1/chat/completions");
        ReflectionTestUtils.setField(aiService, "model", "deepseek-chat");
    }

    @Test
    void containsAIMention_WithAtAI_ReturnsTrue() {
        assertThat(aiService.containsAIMention("@AI 你好")).isTrue();
        assertThat(aiService.containsAIMention("@ai 帮我解答")).isTrue();
        assertThat(aiService.containsAIMention("@Ai 这是什么")).isTrue();
        assertThat(aiService.containsAIMention("我想问 @AI 一个问题")).isTrue();
    }

    @Test
    void containsAIMention_WithoutAtAI_ReturnsFalse() {
        assertThat(aiService.containsAIMention("你好")).isFalse();
        assertThat(aiService.containsAIMention("AI是什么")).isFalse();
        assertThat(aiService.containsAIMention("@someone else")).isFalse();
    }

    @Test
    void extractUserMessage_RemovesAtAIMention() {
        assertThat(aiService.extractUserMessage("@AI 你好")).isEqualTo("你好");
        assertThat(aiService.extractUserMessage("@ai 帮我解答问题")).isEqualTo("帮我解答问题");
        assertThat(aiService.extractUserMessage("请 @AI 告诉我答案")).isEqualTo("请  告诉我答案");
    }

    @Test
    void buildContext_WithReplyTo_IncludesReplyChain() {
        // Given
        UUID groupId = testGroup.getId();

        Message originalMessage = createMessage("原始消息", MessageType.USER);
        Message aiReply = createMessage("AI 的回复", MessageType.AI);
        aiReply.setReplyTo(originalMessage);

        Message userFollowUp = createMessage("@AI 继续说说", MessageType.USER);
        userFollowUp.setReplyTo(aiReply);

        when(messageRepository.findRecentByGroupId(eq(groupId), anyInt()))
            .thenReturn(Arrays.asList(userFollowUp, aiReply, originalMessage));

        // When
        List<Map<String, String>> context = aiService.buildContext(groupId, userFollowUp);

        // Then
        assertThat(context).isNotEmpty();
        // Should include system prompt and conversation history
    }

    @Test
    void buildContext_WithoutReplyTo_UsesRecentMessages() {
        // Given
        UUID groupId = testGroup.getId();

        Message msg1 = createMessage("用户消息1", MessageType.USER);
        Message msg2 = createMessage("AI回复1", MessageType.AI);
        Message msg3 = createMessage("@AI 新问题", MessageType.USER);

        when(messageRepository.findRecentByGroupId(eq(groupId), anyInt()))
            .thenReturn(Arrays.asList(msg3, msg2, msg1));

        // When
        List<Map<String, String>> context = aiService.buildContext(groupId, msg3);

        // Then
        assertThat(context).isNotEmpty();
    }

    @Test
    void shouldTriggerAI_WithMention_ReturnsTrue() {
        Message message = createMessage("@AI 你好", MessageType.USER);
        assertThat(aiService.shouldTriggerAI(message)).isTrue();
    }

    @Test
    void shouldTriggerAI_WithReplyToAI_ReturnsTrue() {
        Message aiMessage = createMessage("我是 AI 回复", MessageType.AI);
        Message userReply = createMessage("继续说", MessageType.USER);
        userReply.setReplyTo(aiMessage);

        assertThat(aiService.shouldTriggerAI(userReply)).isTrue();
    }

    @Test
    void shouldTriggerAI_NormalMessage_ReturnsFalse() {
        Message message = createMessage("普通消息", MessageType.USER);
        assertThat(aiService.shouldTriggerAI(message)).isFalse();
    }

    private Message createMessage(String content, MessageType type) {
        Message message = new Message();
        message.setId(UUID.randomUUID());
        message.setGroup(testGroup);
        message.setSender(testUser);
        message.setContent(content);
        message.setMessageType(type);
        message.setCreatedAt(LocalDateTime.now());
        return message;
    }
}
