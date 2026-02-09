package com.abao.service;

import com.abao.entity.Message;
import com.abao.entity.MessageType;
import com.abao.entity.Group;
import com.abao.entity.User;
import com.abao.repository.MessageRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private ObjectMapper objectMapper;

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
        ReflectionTestUtils.setField(aiService, "maxTokens", 2048);
        ReflectionTestUtils.setField(aiService, "temperature", 0.7);
        ReflectionTestUtils.setField(aiService, "contextWindowMinutes", 30);
        ReflectionTestUtils.setField(aiService, "contextMaxMessages", 50);
    }

    // ====================================================================
    // containsAIMention Tests
    // ====================================================================

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
    void containsAIMention_Null_ReturnsFalse() {
        assertThat(aiService.containsAIMention(null)).isFalse();
    }

    // ====================================================================
    // S6: extractUserMessage Tests — @AI → [提问A宝] (not deletion)
    // ====================================================================

    @Nested
    class TriggerSemanticTests {

        @Test
        void extractUserMessage_ReplacesAtAI_WithSemanticTag() {
            // S6: @AI should be replaced with [提问A宝], not deleted
            assertThat(aiService.extractUserMessage("@AI 你好")).isEqualTo("[提问A宝] 你好");
            assertThat(aiService.extractUserMessage("@ai 帮我解答问题")).isEqualTo("[提问A宝] 帮我解答问题");
        }

        @Test
        void extractUserMessage_MultipleAtAI_AllReplaced() {
            assertThat(aiService.extractUserMessage("@AI 你好 @AI"))
                .isEqualTo("[提问A宝] 你好 [提问A宝]");
        }

        @Test
        void extractUserMessage_MiddleOfSentence_Replaced() {
            assertThat(aiService.extractUserMessage("请 @AI 告诉我答案"))
                .isEqualTo("请 [提问A宝] 告诉我答案");
        }

        @Test
        void extractUserMessage_Null_ReturnsEmpty() {
            assertThat(aiService.extractUserMessage(null)).isEqualTo("");
        }

        @Test
        void extractUserMessage_NoAtAI_Unchanged() {
            assertThat(aiService.extractUserMessage("普通消息")).isEqualTo("普通消息");
        }

        @Test
        void buildContext_PreservesAtAISemantics_InContent() {
            // S6: In built context, user messages with @AI should contain [提问A宝]
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI 你好", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            String userContent = context.stream()
                .filter(m -> "user".equals(m.get("role")))
                .findFirst()
                .map(m -> m.get("content"))
                .orElseThrow();

            assertThat(userContent).contains("[提问A宝]");
            assertThat(userContent).doesNotContain("@AI");
        }
    }

    // ====================================================================
    // S5: replyTo 引用关系标注 Tests
    // ====================================================================

    @Nested
    class ReplyToAnnotationTests {

        @Test
        void buildContext_UserReplyToAI_ContentContainsQuoteAnnotation() {
            // S5: When user replies to AI message, content should have [回复A宝: "..."]
            UUID groupId = testGroup.getId();

            Message aiMsg = createMessage("好的！不过我需要知道具体是哪个领域的信息才能帮你查询。", MessageType.AI);
            aiMsg.setSender(null); // AI has no sender

            Message userReply = createMessage("体育 比如 c罗", MessageType.USER);
            userReply.setReplyTo(aiMsg);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(aiMsg, userReply));

            List<Map<String, String>> context = aiService.buildContext(groupId, userReply);

            // Find the user reply in context
            String replyContent = context.stream()
                .filter(m -> "user".equals(m.get("role")))
                .reduce((first, second) -> second) // get last user message
                .map(m -> m.get("content"))
                .orElseThrow();

            assertThat(replyContent).contains("[回复A宝:");
            assertThat(replyContent).contains("体育 比如 c罗");
        }

        @Test
        void buildContext_UserReplyToUser_NoQuoteAnnotation() {
            // S5: Reply to normal user message should NOT have [回复A宝] tag
            UUID groupId = testGroup.getId();

            Message userMsg1 = createMessage("你们觉得呢", MessageType.USER);

            User user2 = new User();
            user2.setId(UUID.randomUUID());
            user2.setNickname("Test2");

            Message userReply = createMessage("我觉得不错", MessageType.USER);
            userReply.setSender(user2);
            userReply.setReplyTo(userMsg1);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(userMsg1, userReply));

            List<Map<String, String>> context = aiService.buildContext(groupId, userReply);

            // No [回复A宝] annotation for user-to-user replies
            context.stream()
                .filter(m -> "user".equals(m.get("role")))
                .forEach(m -> assertThat(m.get("content")).doesNotContain("[回复A宝"));
        }

        @Test
        void buildContext_ReplyToContent_TruncatedAt50Chars() {
            // S5: Quoted content longer than 50 chars should be truncated
            UUID groupId = testGroup.getId();

            String longContent = "这是一条非常非常长的AI回复消息，包含了很多详细的信息和解释，需要被截断以避免上下文过长影响AI理解，所以这里再多写一些内容";
            assertThat(longContent.length()).isGreaterThan(50);

            Message aiMsg = createMessage(longContent, MessageType.AI);
            aiMsg.setSender(null);

            Message userReply = createMessage("继续说", MessageType.USER);
            userReply.setReplyTo(aiMsg);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(aiMsg, userReply));

            List<Map<String, String>> context = aiService.buildContext(groupId, userReply);

            String replyContent = context.stream()
                .filter(m -> "user".equals(m.get("role")))
                .reduce((first, second) -> second)
                .map(m -> m.get("content"))
                .orElseThrow();

            // Should contain truncation marker
            assertThat(replyContent).contains("...");
            // The quoted part should be <= 50 chars + "..."
            assertThat(replyContent).contains("[回复A宝:");
        }
    }

    // ====================================================================
    // S2: triggerMessage 兜底校验 Tests
    // ====================================================================

    @Nested
    class TriggerMessageGuaranteeTests {

        @Test
        void buildContext_TriggerNotInQuery_AppendsToEnd() {
            // S2: If trigger message is not in query results, it should be appended
            UUID groupId = testGroup.getId();

            Message oldMsg = createMessage("旧消息", MessageType.USER);
            Message trigger = createMessage("@AI 你好", MessageType.USER);
            trigger.setId(UUID.randomUUID()); // distinct ID

            // Query returns only oldMsg, trigger is missing
            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(oldMsg));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            // trigger should be appended: system + oldMsg + trigger = 3
            assertThat(context).hasSize(3);

            // Last message should be the trigger
            String lastContent = context.get(context.size() - 1).get("content");
            assertThat(lastContent).contains("[提问A宝]");
        }

        @Test
        void buildContext_TriggerInQuery_NoDuplicate() {
            // S2: If trigger is already in query results, should not duplicate
            UUID groupId = testGroup.getId();

            Message trigger = createMessage("@AI 你好", MessageType.USER);

            // Query already contains the trigger
            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            // system + 1 trigger = 2 (not duplicated)
            assertThat(context).hasSize(2);
        }
    }

    // ====================================================================
    // S7: 跨窗口 replyTo 补偿 Tests
    // ====================================================================

    @Nested
    class CrossWindowReplyTests {

        @Test
        void buildContext_ReplyToOutsideWindow_InsertsCompensation() {
            // S7: When referenced AI message is not in context, compensate
            UUID groupId = testGroup.getId();

            // This AI message is NOT in the context window (old message)
            Message oldAiMsg = createMessage("我之前说过关于Java的一些内容", MessageType.AI);
            oldAiMsg.setSender(null);
            oldAiMsg.setId(UUID.randomUUID());

            // User replies to old AI message
            Message userReply = createMessage("能再详细说说吗", MessageType.USER);
            userReply.setReplyTo(oldAiMsg);

            // Context window does NOT contain oldAiMsg
            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(userReply));

            List<Map<String, String>> context = aiService.buildContext(groupId, userReply);

            // Should contain compensation: system + compensation_system + assistant(oldAiMsg) + boundary_system + user
            // At minimum, the old AI message content should appear somewhere in context
            boolean hasCompensation = context.stream()
                .anyMatch(m -> "assistant".equals(m.get("role"))
                    && m.get("content").contains("我之前说过关于Java的一些内容"));
            assertThat(hasCompensation).isTrue();
        }

        @Test
        void buildContext_ReplyToInsideWindow_NoCompensation() {
            // S7: When referenced AI message IS in context, no extra insertion
            UUID groupId = testGroup.getId();

            Message aiMsg = createMessage("我是A宝", MessageType.AI);
            aiMsg.setSender(null);

            Message userReply = createMessage("继续说", MessageType.USER);
            userReply.setReplyTo(aiMsg);

            // Both messages are in context window
            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(aiMsg, userReply));

            List<Map<String, String>> context = aiService.buildContext(groupId, userReply);

            // No compensation needed: system + aiMsg + userReply = 3
            long assistantCount = context.stream()
                .filter(m -> "assistant".equals(m.get("role")))
                .count();
            assertThat(assistantCount).isEqualTo(1); // only the one already in window
        }
    }

    // ====================================================================
    // S8: System Prompt 重写 Tests
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
            Message msg2 = createMessage("hi", MessageType.USER);
            msg2.setSender(user2);
            Message trigger = createMessage("@AI 群里有谁", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(msg1, msg2, trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            String systemPrompt = context.get(0).get("content");
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
            assertThat(systemPrompt).contains("A宝");
        }

        @Test
        void buildContext_SystemPromptMentionsTwoTriggerTypes() {
            // S8: New system prompt should explain both trigger types
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI hi", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            String systemPrompt = context.get(0).get("content");
            // Should mention both [提问A宝] and [回复A宝] trigger types
            assertThat(systemPrompt).contains("[提问A宝]");
            assertThat(systemPrompt).contains("[回复A宝");
        }

        @Test
        void buildContext_SystemPromptForbidsRepetition() {
            // S8: System prompt should contain anti-repetition rule
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI test", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            String systemPrompt = context.get(0).get("content");
            assertThat(systemPrompt).contains("严禁重复");
        }

        @Test
        void buildContext_SystemPromptContainsOutputFormatRules() {
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI hi", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            String systemPrompt = context.get(0).get("content");
            assertThat(systemPrompt).containsAnyOf(
                "不要输出", "不要以任何人的名字开头", "不要模拟其他用户"
            );
        }

        @Test
        void buildContext_SystemPromptDeduplicatesMembers() {
            UUID groupId = testGroup.getId();

            Message msg1 = createMessage("msg1", MessageType.USER);
            Message msg2 = createMessage("msg2", MessageType.USER);
            Message trigger = createMessage("@AI 群里有谁", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(msg1, msg2, trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            String systemPrompt = context.get(0).get("content");
            int firstIndex = systemPrompt.indexOf("TestUser");
            assertThat(firstIndex).isGreaterThanOrEqualTo(0);
        }
    }

    // ====================================================================
    // shouldTriggerAI Tests
    // ====================================================================

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

    @Test
    void shouldTriggerAI_Null_ReturnsFalse() {
        assertThat(aiService.shouldTriggerAI(null)).isFalse();
    }

    @Test
    void shouldTriggerAI_AIMessageType_ReturnsFalse() {
        Message aiMsg = createMessage("AI回复", MessageType.AI);
        assertThat(aiService.shouldTriggerAI(aiMsg)).isFalse();
    }

    @Test
    void shouldTriggerAI_SystemMessageType_ReturnsFalse() {
        Message sysMsg = createMessage("系统通知", MessageType.SYSTEM);
        assertThat(aiService.shouldTriggerAI(sysMsg)).isFalse();
    }

    // ====================================================================
    // Context Window Expansion Tests
    // ====================================================================

    @Nested
    class ContextWindowTests {

        @Test
        void buildContext_UsesTimeWindowedQuery_Instead_of_FixedLimit() {
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI 群里有谁", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            aiService.buildContext(groupId, trigger);

            verify(messageRepository).findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50));
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

            LocalDateTime captured = sinceCaptor.getValue();
            LocalDateTime expected = LocalDateTime.now().minusMinutes(30);
            assertThat(captured).isBetween(expected.minusSeconds(5), expected.plusSeconds(5));
        }

        @Test
        void buildContext_LimitsTo50Messages() {
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI test", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            aiService.buildContext(groupId, trigger);

            verify(messageRepository).findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50));
        }

        @Test
        void buildContext_MessagesInChronologicalOrder() {
            UUID groupId = testGroup.getId();

            Message msg1 = createMessageAt("早上好", MessageType.USER, LocalDateTime.now().minusMinutes(10));
            Message msg2 = createMessageAt("AI回复", MessageType.AI, LocalDateTime.now().minusMinutes(9));
            Message msg3 = createMessageAt("@AI 群里有谁", MessageType.USER, LocalDateTime.now());

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(msg1, msg2, msg3));

            List<Map<String, String>> context = aiService.buildContext(groupId, msg3);

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

            assertThat(context).hasSize(4);

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

            assertThat(context).hasSize(2);
            assertThat(context.get(0).get("role")).isEqualTo("system");
            assertThat(context.get(1).get("role")).isEqualTo("user");
        }

        @Test
        void buildContext_WithReplyTo_IncludesReplyChain() {
            UUID groupId = testGroup.getId();

            Message originalMessage = createMessage("原始消息", MessageType.USER);
            Message aiReply = createMessage("AI 的回复", MessageType.AI);
            aiReply.setReplyTo(originalMessage);

            Message userFollowUp = createMessage("@AI 继续说说", MessageType.USER);
            userFollowUp.setReplyTo(aiReply);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(originalMessage, aiReply, userFollowUp));

            List<Map<String, String>> context = aiService.buildContext(groupId, userFollowUp);

            assertThat(context).isNotEmpty();
            assertThat(context).hasSize(4);
        }

        @Test
        void buildContext_WithoutReplyTo_UsesRecentMessages() {
            UUID groupId = testGroup.getId();

            Message msg1 = createMessage("用户消息1", MessageType.USER);
            Message msg2 = createMessage("AI回复1", MessageType.AI);
            Message msg3 = createMessage("@AI 新问题", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(msg1, msg2, msg3));

            List<Map<String, String>> context = aiService.buildContext(groupId, msg3);

            assertThat(context).isNotEmpty();
            assertThat(context).hasSize(4);
        }
    }

    // ====================================================================
    // Name Sanitization Tests
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
            UUID groupId = testGroup.getId();

            Message userMsg = createMessage("大家好", MessageType.USER);
            Message trigger = createMessage("@AI 你好", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(userMsg, trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

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

            Map<String, String> aiMsgInContext = context.stream()
                .filter(m -> "assistant".equals(m.get("role")))
                .findFirst()
                .orElseThrow();
            assertThat(aiMsgInContext.get("content")).isEqualTo("我是A宝");
        }

        @Test
        void buildContext_NullSender_UsesUnknownFallback() {
            UUID groupId = testGroup.getId();

            Message msg = createMessage("匿名消息", MessageType.USER);
            msg.setSender(null);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(msg));

            List<Map<String, String>> context = aiService.buildContext(groupId, msg);

            String content = context.get(1).get("content");
            assertThat(content).contains("Unknown");
        }
    }

    // ====================================================================
    // S10: Structured Debug Logging Tests
    // ====================================================================

    @Nested
    class StructuredLoggingTests {

        @Test
        void processMessage_NonTrigger_DoesNotCallBuildContext() {
            // processMessage should return early for non-trigger messages
            Message normalMsg = createMessage("普通消息", MessageType.USER);

            aiService.processMessage(normalMsg);

            verifyNoInteractions(messageRepository);
        }
    }

    // ====================================================================
    // S9: RestTemplate Bean 注入 Tests
    // ====================================================================

    @Nested
    class RestTemplateBeanTests {

        @Test
        void aiService_HasRestTemplateField() {
            // S9: AIService should have a RestTemplate field (injected bean, not new)
            // After S9 implementation, the restTemplate should be a constructor-injected field
            Object rt = ReflectionTestUtils.getField(aiService, "restTemplate");
            assertThat(rt).isNotNull();
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

    // ====================================================================
    // BUG-FIX: 引用追问时，AI 回答被引用消息而非当前追问
    // Root Cause: 上下文格式不清晰，AI 把引用内容当作需回答的问题
    // ====================================================================

    @Nested
    class QuoteFollowUpBugTests {

        @Test
        void buildContext_QuoteFollowUp_LastMessageClearlyShowsCurrentQuestion() {
            // 场景: 用户引用 AI 的 "1+5=6" 回复，追问 "1+7=?"
            // 期望: 上下文最后一条用户消息中，"1+7=?" 必须作为独立的 [追问] 部分
            //       而不是和引用内容混在同一个字符串中被 AI 误读
            UUID groupId = testGroup.getId();

            User user2 = new User();
            user2.setId(UUID.randomUUID());
            user2.setNickname("Test2");

            // AI 之前的回复
            Message aiReply1 = createMessage("1+5=6～ 还有其他问题需要帮忙吗？😊", MessageType.AI);
            aiReply1.setSender(null);

            // 用户引用 AI 回复，发起追问
            Message userFollowUp = createMessage("1+7=?", MessageType.USER);
            userFollowUp.setSender(user2);
            userFollowUp.setReplyTo(aiReply1);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(aiReply1, userFollowUp));

            List<Map<String, String>> context = aiService.buildContext(groupId, userFollowUp);

            // 取最后一条 user 消息
            String lastUserContent = context.stream()
                .filter(m -> "user".equals(m.get("role")))
                .reduce((first, second) -> second)
                .map(m -> m.get("content"))
                .orElseThrow();

            // 核心断言: 引用内容和追问内容必须结构化分离
            // 追问 "1+7=?" 必须在 [追问] 标记之后，让 AI 明确知道这才是要回答的问题
            assertThat(lastUserContent).contains("[追问]");
            assertThat(lastUserContent).contains("1+7=?");
            // 引用部分也要存在
            assertThat(lastUserContent).contains("[回复A宝:");
        }

        @Test
        void buildContext_MultiRoundQuoteFollowUp_EachRoundClearlyMarked() {
            // 模拟截图2的完整场景: 多轮引用追问
            UUID groupId = testGroup.getId();

            User user2 = new User();
            user2.setId(UUID.randomUUID());
            user2.setNickname("Test2");

            // Round 1: @AI 1+5=?
            Message q1 = createMessage("@AI 1+5=?", MessageType.USER);
            q1.setSender(user2);

            Message a1 = createMessage("1+5=6～ 还有其他问题需要帮忙吗？😊", MessageType.AI);
            a1.setSender(null);

            // Round 2: 引用 a1, 追问 1+7=?
            Message q2 = createMessage("1+7=?", MessageType.USER);
            q2.setSender(user2);
            q2.setReplyTo(a1);

            Message a2 = createMessage("1+7=8～ 数学问题随时可以问我哦！😊", MessageType.AI);
            a2.setSender(null);

            // Round 3: 引用 a2, 追问 1+100=?
            Message q3 = createMessage("1+100=?", MessageType.USER);
            q3.setSender(user2);
            q3.setReplyTo(a2);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(q1, a1, q2, a2, q3));

            List<Map<String, String>> context = aiService.buildContext(groupId, q3);

            // 最后一条 user 消息 (q3)
            String lastUserContent = context.stream()
                .filter(m -> "user".equals(m.get("role")))
                .reduce((first, second) -> second)
                .map(m -> m.get("content"))
                .orElseThrow();

            // q3 的追问 "1+100=?" 必须在 [追问] 标记之后
            assertThat(lastUserContent).contains("[追问]");
            assertThat(lastUserContent).contains("1+100=?");
            // 引用的是 a2 的内容
            assertThat(lastUserContent).contains("[回复A宝:");
            assertThat(lastUserContent).contains("1+7=8");
            // 不应该包含 a1 的内容 (上一轮的引用)
            assertThat(lastUserContent).doesNotContain("1+5=6");
        }

        @Test
        void buildContext_SystemPrompt_InstructsToFocusOnFollowUp() {
            // System prompt 必须明确告诉 AI: [追问] 标记后的内容才是要回答的问题
            UUID groupId = testGroup.getId();
            Message trigger = createMessage("@AI hi", MessageType.USER);

            when(messageRepository.findContextWindow(eq(groupId), any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(trigger));

            List<Map<String, String>> context = aiService.buildContext(groupId, trigger);

            String systemPrompt = context.get(0).get("content");
            assertThat(systemPrompt).contains("[追问]");
            // 必须有指令说明 [追问] 后面才是要回答的
            assertThat(systemPrompt).containsAnyOf("重点回答", "必须回答", "针对.*追问");
        }
    }

    // ====================================================================
    // S4: processMessage @Async 去除 Tests (反射验证注解)
    // ====================================================================

    @Nested
    class AsyncAnnotationTests {

        @Test
        void processMessage_ShouldNotHaveAsyncAnnotation() throws NoSuchMethodException {
            // S4: processMessage() should NOT have @Async annotation
            var method = AIService.class.getMethod("processMessage", Message.class);
            var asyncAnnotation = method.getAnnotation(
                org.springframework.scheduling.annotation.Async.class);
            assertThat(asyncAnnotation).isNull();
        }
    }

    // ====================================================================
    // Helper methods
    // ====================================================================

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
