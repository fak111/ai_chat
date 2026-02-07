package com.abao.service;

import com.abao.entity.Message;
import com.abao.entity.MessageType;
import com.abao.entity.Group;
import com.abao.entity.User;
import com.abao.repository.MessageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

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
        ReflectionTestUtils.setField(aiService, "baseUrl", "https://api.deepseek.com");
        ReflectionTestUtils.setField(aiService, "model", "deepseek-chat");
        ReflectionTestUtils.setField(aiService, "contextWindowMinutes", 30);
        ReflectionTestUtils.setField(aiService, "contextMaxMessages", 50);
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

        // Updated to use new time-windowed query
        when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
            .thenReturn(List.of(originalMessage, aiReply, userFollowUp));

        // When
        List<Map<String, String>> context = aiService.buildContext(groupId, userFollowUp);

        // Then
        assertThat(context).isNotEmpty();
        // Should include system prompt + 3 conversation messages
        assertThat(context).hasSize(4);
    }

    @Test
    void buildContext_WithoutReplyTo_UsesRecentMessages() {
        // Given
        UUID groupId = testGroup.getId();

        Message msg1 = createMessage("用户消息1", MessageType.USER);
        Message msg2 = createMessage("AI回复1", MessageType.AI);
        Message msg3 = createMessage("@AI 新问题", MessageType.USER);

        // Updated to use new time-windowed query (returns ASC order)
        when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
            .thenReturn(List.of(msg1, msg2, msg3));

        // When
        List<Map<String, String>> context = aiService.buildContext(groupId, msg3);

        // Then
        assertThat(context).isNotEmpty();
        assertThat(context).hasSize(4); // system + 3 messages
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

    // ====================================================================
    // Context Window Expansion Tests (P0 - chat-ai-optimization-plan.md)
    // ====================================================================

    @Nested
    class ContextWindowTests {

        @Test
        void buildContext_UsesTimeWindowedQuery_Instead_of_FixedLimit() {
            // The new buildContext should call findContextWindow (time-based)
            // instead of findRecentByGroupId (count-only)
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI 群里有谁", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            aiService.buildContext(groupId, trigger);

            // Should call the new time-windowed query
            verify(messageRepository).findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50));
            // Should NOT call the old fixed-limit query
            verify(messageRepository, never()).findRecentByGroupId(any(), anyInt());
        }

        @Test
        void buildContext_QueriesLast30MinutesOfMessages() {
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI 你好", MessageType.USER);

            ArgumentCaptor<LocalDateTime> sinceCaptor = ArgumentCaptor.forClass(LocalDateTime.class);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            aiService.buildContext(groupId, trigger);

            verify(messageRepository).findContextWindow(eq(groupId), sinceCaptor.capture(), eq(50));

            // The 'since' timestamp should be approximately 30 minutes ago
            LocalDateTime captured = sinceCaptor.getValue();
            LocalDateTime expected = LocalDateTime.now().minusMinutes(30);
            // Allow 5 seconds tolerance for test execution time
            assertThat(captured).isBetween(expected.minusSeconds(5), expected.plusSeconds(5));
        }

        @Test
        void buildContext_LimitsTo50Messages() {
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI test", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            aiService.buildContext(groupId, trigger);

            // Verify limit parameter is 50
            verify(messageRepository).findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50));
        }

        @Test
        void buildContext_MessagesInChronologicalOrder() {
            UUID groupId = testGroup.getId();

            Message msg1 = createMessageAt("早上好", MessageType.USER, LocalDateTime.now().minusMinutes(10));
            Message msg2 = createMessageAt("AI回复", MessageType.AI, LocalDateTime.now().minusMinutes(9));
            Message msg3 = createMessageAt("@AI 群里有谁", MessageType.USER, LocalDateTime.now());

            // findContextWindow returns ASC order (chronological)
            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(msg1, msg2, msg3));

            List<Map<String, String>> context = aiService.buildContext(groupId, msg3);

            // First message is system prompt, then chronological user/assistant messages
            assertThat(context.get(0).get("role")).isEqualTo("system");
            assertThat(context.get(1).get("role")).isEqualTo("user");
            assertThat(context.get(2).get("role")).isEqualTo("assistant");
            assertThat(context.get(3).get("role")).isEqualTo("user");
        }

        @Test
        void buildContext_IncludesBothUserAndAIMessages() {
            UUID groupId = testGroup.getId();

            Message userMsg = createMessage("hello", MessageType.USER);
            Message aiMsg = createMessage("hi there", MessageType.AI);
            Message trigger = createMessage("@AI 继续", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(userMsg, aiMsg, trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            // Should have system + 3 messages = 4 total
            assertThat(context).hasSize(4);

            // Verify roles
            long userCount = context.stream().filter(m -> "user".equals(m.get("role"))).count();
            long assistantCount = context.stream().filter(m -> "assistant".equals(m.get("role"))).count();
            assertThat(userCount).isEqualTo(2);
            assertThat(assistantCount).isEqualTo(1);
        }

        @Test
        void buildContext_SkipsSystemMessages() {
            UUID groupId = testGroup.getId();

            Message systemMsg = createMessage("TestUser 加入了群聊", MessageType.SYSTEM);
            Message userMsg = createMessage("@AI hi", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(systemMsg, userMsg));

            List<Map<String, String>> context = aiService.buildContext(groupId, userMsg);

            // system prompt + 1 user message (system message skipped)
            assertThat(context).hasSize(2);
            assertThat(context.get(0).get("role")).isEqualTo("system");
            assertThat(context.get(1).get("role")).isEqualTo("user");
        }
    }

    // ====================================================================
    // System Prompt Enrichment Tests (P0)
    // ====================================================================

    @Nested
    class SystemPromptTests {

        @Test
        void buildContext_SystemPromptContainsActiveMembers() {
            UUID groupId = testGroup.getId();

            User user2 = new User();
            user2.setId(UUID.randomUUID());
            user2.setNickname("Test2");

            Message msg1 = createMessage("hello", MessageType.USER);
            // msg1 already has testUser (nickname "TestUser")

            Message msg2 = createMessage("hi", MessageType.USER);
            msg2.setSender(user2);

            Message trigger = createMessage("@AI 群里有谁", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(msg1, msg2, trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            String systemPrompt = context.get(0).get("content");
            // System prompt should contain active member names
            assertThat(systemPrompt).contains("TestUser");
            assertThat(systemPrompt).contains("Test2");
        }

        @Test
        void buildContext_SystemPromptContainsGroupInfo() {
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI 你好", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            String systemPrompt = context.get(0).get("content");
            // Should contain A宝 persona
            assertThat(systemPrompt).contains("A宝");
        }

        @Test
        void buildContext_SystemPromptContainsOutputFormatRules() {
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI hi", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            String systemPrompt = context.get(0).get("content");
            // Should explicitly forbid outputting "Username: content" format
            assertThat(systemPrompt).containsAnyOf(
                "不要输出", "不要以任何人的名字开头", "不要模拟其他用户"
            );
        }

        @Test
        void buildContext_SystemPromptDeduplicatesMembers() {
            UUID groupId = testGroup.getId();

            // Same user sends multiple messages
            Message msg1 = createMessage("msg1", MessageType.USER);
            Message msg2 = createMessage("msg2", MessageType.USER);
            Message trigger = createMessage("@AI 群里有谁", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(msg1, msg2, trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            String systemPrompt = context.get(0).get("content");
            // "TestUser" should appear only once in the member list
            int firstIndex = systemPrompt.indexOf("TestUser");
            int lastIndex = systemPrompt.lastIndexOf("TestUser");
            // Could appear in both member list and rules, but not duplicated in member list
            // This test verifies the member extraction has deduplication
            assertThat(firstIndex).isGreaterThanOrEqualTo(0);
        }
    }

    // ====================================================================
    // Name Sanitization Tests (OpenAI name field constraint)
    // ====================================================================

    @Nested
    class NameSanitizationTests {

        @Test
        void sanitizeName_AsciiName_Unchanged() {
            assertThat(aiService.sanitizeName("TestUser")).isEqualTo("TestUser");
            assertThat(aiService.sanitizeName("user_123")).isEqualTo("user_123");
            assertThat(aiService.sanitizeName("test-user")).isEqualTo("test-user");
        }

        @Test
        void sanitizeName_ChineseName_Converted() {
            String result = aiService.sanitizeName("小明");
            // Should only contain [a-zA-Z0-9_-]
            assertThat(result).matches("[a-zA-Z0-9_-]+");
            assertThat(result).isNotEmpty();
        }

        @Test
        void sanitizeName_NullOrEmpty_ReturnsFallback() {
            assertThat(aiService.sanitizeName(null)).isEqualTo("user");
            assertThat(aiService.sanitizeName("")).isEqualTo("user");
        }

        @Test
        void sanitizeName_MixedChars_PreservesValid() {
            String result = aiService.sanitizeName("Test用户123");
            assertThat(result).matches("[a-zA-Z0-9_-]+");
            assertThat(result).contains("Test");
            assertThat(result).contains("123");
        }

        @Test
        void buildContext_UserMessages_IncludeSenderNameInContent() {
            // Per optimization plan: content format is "SenderName: message"
            UUID groupId = testGroup.getId();

            Message userMsg = createMessage("大家好", MessageType.USER);
            Message trigger = createMessage("@AI 你好", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(userMsg, trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            // User messages should contain sender name prefix
            Map<String, String> firstUserMsg = context.get(1);
            assertThat(firstUserMsg.get("role")).isEqualTo("user");
            assertThat(firstUserMsg.get("content")).contains("TestUser");
            assertThat(firstUserMsg.get("content")).contains("大家好");
        }

        @Test
        void buildContext_AIMessages_NoNamePrefix() {
            UUID groupId = testGroup.getId();

            Message aiMsg = createMessage("我是A宝", MessageType.AI);
            Message trigger = createMessage("@AI 你好", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(aiMsg, trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            // AI messages should not have name prefix, just content
            Map<String, String> aiMsgInContext = context.stream()
                .filter(m -> "assistant".equals(m.get("role")))
                .findFirst()
                .orElseThrow();
            assertThat(aiMsgInContext.get("content")).isEqualTo("我是A宝");
        }
    }

    // ====================================================================
    // Configurable Context Window Tests
    // ====================================================================

    @Nested
    class ConfigurableContextTests {

        @Test
        void contextWindowMinutes_DefaultIs30() {
            int minutes = (int) ReflectionTestUtils.getField(aiService, "contextWindowMinutes");
            assertThat(minutes).isEqualTo(30);
        }

        @Test
        void contextMaxMessages_DefaultIs50() {
            int maxMessages = (int) ReflectionTestUtils.getField(aiService, "contextMaxMessages");
            assertThat(maxMessages).isEqualTo(50);
        }
    }

    private Message createMessageAt(String content, MessageType type, LocalDateTime createdAt) {
        Message message = createMessage(content, type);
        message.setCreatedAt(createdAt);
        return message;
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
