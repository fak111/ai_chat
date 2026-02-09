package com.abao.service;

import com.abao.entity.Message;
import com.abao.entity.MessageType;
import com.abao.repository.MessageRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AIService {

    private final MessageRepository messageRepository;
    private final MessageService messageService;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate; // S9: injected bean

    @Value("${ai.deepseek.api-key:}")
    private String apiKey;

    @Value("${ai.deepseek.base-url:https://api.deepseek.com}")
    private String baseUrl;

    @Value("${ai.deepseek.model:deepseek-chat}")
    private String model;

    @Value("${ai.deepseek.max-tokens:2048}")
    private int maxTokens;

    @Value("${ai.deepseek.temperature:0.7}")
    private double temperature;

    @Value("${ai.context.window-minutes:30}")
    private int contextWindowMinutes;

    @Value("${ai.context.max-messages:50}")
    private int contextMaxMessages;

    private static final Pattern AI_MENTION_PATTERN = Pattern.compile("@[Aa][Ii]\\b");

    // S9: Constructor injection with @Qualifier for RestTemplate
    public AIService(MessageRepository messageRepository,
                     MessageService messageService,
                     ObjectMapper objectMapper,
                     @Qualifier("aiRestTemplate") RestTemplate restTemplate) {
        this.messageRepository = messageRepository;
        this.messageService = messageService;
        this.objectMapper = objectMapper;
        this.restTemplate = restTemplate;
    }

    /**
     * Check if a message contains @AI mention
     */
    public boolean containsAIMention(String content) {
        if (content == null) return false;
        return AI_MENTION_PATTERN.matcher(content).find();
    }

    /**
     * S6: Extract the user's actual message, replacing @AI with semantic tag [提问A宝]
     */
    public String extractUserMessage(String content) {
        if (content == null) return "";
        return AI_MENTION_PATTERN.matcher(content).replaceAll("[提问A宝]").trim();
    }

    /**
     * Determine if AI should respond to this message
     */
    public boolean shouldTriggerAI(Message message) {
        if (message == null || message.getMessageType() != MessageType.USER) {
            return false;
        }

        // Trigger if @AI mentioned
        if (containsAIMention(message.getContent())) {
            return true;
        }

        // Trigger if replying to an AI message
        if (message.getReplyTo() != null && message.getReplyTo().getMessageType() == MessageType.AI) {
            return true;
        }

        return false;
    }

    /**
     * Build conversation context for AI with time-windowed context
     */
    public List<Map<String, String>> buildContext(UUID groupId, Message triggerMessage) {
        List<Map<String, String>> messages = new ArrayList<>();

        // Get recent messages within time window (already in ASC order)
        LocalDateTime since = LocalDateTime.now().minusMinutes(contextWindowMinutes);
        List<Message> recentMessages = messageRepository.findContextWindow(groupId, since, contextMaxMessages);

        // S2: triggerMessage 兜底校验 — 确保 triggerMessage 在 context 中
        boolean triggerPresent = recentMessages.stream()
            .anyMatch(m -> m.getId().equals(triggerMessage.getId()));
        if (!triggerPresent) {
            recentMessages = new ArrayList<>(recentMessages);
            recentMessages.add(triggerMessage);
        }

        // Extract active member names (deduplicated)
        Set<String> activeMembers = new LinkedHashSet<>();
        for (Message msg : recentMessages) {
            if (msg.getMessageType() == MessageType.USER && msg.getSender() != null) {
                String nickname = msg.getSender().getNickname();
                if (nickname != null && !nickname.isEmpty()) {
                    // Sanitize: truncate and strip newlines to prevent prompt injection
                    String safeName = nickname.replaceAll("[\\r\\n]", "");
                    if (safeName.length() > 20) safeName = safeName.substring(0, 20);
                    activeMembers.add(safeName);
                }
            }
        }

        // Build enriched system prompt with group context
        String systemPrompt = buildSystemPrompt(activeMembers);
        messages.add(Map.of("role", "system", "content", systemPrompt));

        // S7: 跨窗口 replyTo 补偿
        Set<UUID> contextMessageIds = recentMessages.stream()
            .map(Message::getId)
            .collect(Collectors.toSet());

        List<Message> replyCompensations = new ArrayList<>();
        for (Message msg : recentMessages) {
            if (msg.getReplyTo() != null
                && msg.getReplyTo().getMessageType() == MessageType.AI
                && !contextMessageIds.contains(msg.getReplyTo().getId())) {
                replyCompensations.add(msg.getReplyTo());
                contextMessageIds.add(msg.getReplyTo().getId()); // 避免重复补偿
            }
        }

        if (!replyCompensations.isEmpty()) {
            messages.add(Map.of("role", "system",
                "content", "[以下是被引用的历史消息，用于理解追问上下文]"));
            for (Message comp : replyCompensations) {
                messages.add(Map.of("role", "assistant", "content", comp.getContent()));
            }
            messages.add(Map.of("role", "system",
                "content", "[以下是最近的对话记录]"));
        }

        // Build conversation history (already chronological from query)
        for (Message msg : recentMessages) {
            String role;
            String content = msg.getContent();

            switch (msg.getMessageType()) {
                case AI -> role = "assistant";
                case USER -> {
                    role = "user";
                    String displayName = msg.getSender() != null
                        ? msg.getSender().getNickname()
                        : "Unknown";

                    // S5+S11: 标注引用关系，追问内容用 [追问] 标记分离
                    if (msg.getReplyTo() != null
                        && msg.getReplyTo().getMessageType() == MessageType.AI) {
                        String quoted = msg.getReplyTo().getContent();
                        if (quoted != null && quoted.length() > 50) {
                            quoted = quoted.substring(0, 50) + "...";
                        }
                        content = displayName + " [回复A宝: \"" + quoted + "\"] [追问]: "
                                + extractUserMessage(content);
                    } else {
                        content = displayName + ": " + extractUserMessage(content);
                    }
                }
                default -> {
                    continue; // Skip system messages
                }
            }

            messages.add(Map.of("role", role, "content", content));
        }

        return messages;
    }

    /**
     * S8: Build enriched system prompt with two trigger types and anti-repetition rule
     */
    private String buildSystemPrompt(Set<String> activeMembers) {
        String memberList = activeMembers.isEmpty()
            ? "暂无"
            : String.join("、", activeMembers);

        return """
            你是"A宝"，一个群聊 AI 助手。

            ## 群聊信息
            - 当前群内活跃成员: %s

            ## 你的人设
            - 名字叫 A宝
            - 风格：友好、简洁、有趣
            - 用口语化中文回复
            - 回复长度控制在 1-3 句话，除非用户要求详细解答

            ## 触发规则
            你会在以下两种情况被触发回复：
            1. 用户消息中包含 [提问A宝] 标记 — 这是用户直接向你提问
            2. 用户引用你之前的回复进行追问 — 消息格式为: 用户名 [回复A宝: "引用内容"] [追问]: 实际问题

            **最重要**: 当看到 [追问] 标记时，你必须重点回答 [追问] 后面的内容，那才是用户当前的问题。[回复A宝: "..."] 中的内容只是上下文参考，不要把它当作需要回答的问题。

            ## 回复规范
            - 严禁重复你之前已经回复过的内容
            - 直接回复内容，不要以任何人的名字开头
            - 不要模拟其他用户说话
            - 不要输出 "用户名: 内容" 这种格式
            - 你的回复就是你自己说的话，不需要角色标注
            - 如果不确定答案，诚实地说不知道
            - 如果用户问"群里有谁"，根据活跃成员列表回答
            """.formatted(memberList);
    }

    /**
     * Sanitize nickname for OpenAI name field constraint [a-zA-Z0-9_-]
     */
    public String sanitizeName(String name) {
        if (name == null || name.isEmpty()) {
            return "user";
        }
        String sanitized = name.replaceAll("[^a-zA-Z0-9_-]", "_");
        // Remove consecutive underscores and trim leading/trailing underscores
        sanitized = sanitized.replaceAll("_+", "_").replaceAll("^_|_$", "");
        return sanitized.isEmpty() ? "user" : sanitized;
    }

    /**
     * S4: Removed @Async — async entry point is in MessageEventListener
     * S10: Added structured debug logging
     */
    public void processMessage(Message message) {
        if (!shouldTriggerAI(message)) {
            return;
        }

        try {
            UUID groupId = message.getGroup().getId();
            List<Map<String, String>> context = buildContext(groupId, message);

            // S10: 结构化调试日志
            log.info("AI context: groupId={}, triggerMsgId={}, replyToId={}, contextSize={}, trigger='{}'",
                groupId,
                message.getId(),
                message.getReplyTo() != null ? message.getReplyTo().getId() : "null",
                context.size(),
                message.getContent().length() > 100
                    ? message.getContent().substring(0, 100) + "..."
                    : message.getContent());

            if (log.isDebugEnabled()) {
                log.debug("Full AI context: {}", context);
            }

            String aiResponse = callDeepSeekAPI(context);

            if (aiResponse != null && !aiResponse.isEmpty()) {
                messageService.sendAIMessage(groupId, aiResponse, message.getId());
            }
        } catch (Exception e) {
            log.error("Error processing AI message", e);
            // Optionally send an error message to the group
            try {
                messageService.sendAIMessage(
                    message.getGroup().getId(),
                    "抱歉，我暂时无法回复，请稍后再试。",
                    message.getId()
                );
            } catch (Exception ex) {
                log.error("Failed to send error message", ex);
            }
        }
    }

    /**
     * S9: Call DeepSeek API using injected RestTemplate bean with timeout
     */
    private String callDeepSeekAPI(List<Map<String, String>> messages) {
        if (apiKey == null || apiKey.isEmpty()) {
            log.warn("DeepSeek API key not configured");
            return "AI 服务未配置，请联系管理员。";
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", model);
            requestBody.put("messages", messages);
            requestBody.put("max_tokens", maxTokens);
            requestBody.put("temperature", temperature);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);

            String apiUrl = baseUrl + "/v1/chat/completions";
            ResponseEntity<String> response = restTemplate.exchange(
                apiUrl,
                HttpMethod.POST,
                request,
                String.class
            );

            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode choices = root.get("choices");
                if (choices != null && choices.isArray() && choices.size() > 0) {
                    JsonNode firstChoice = choices.get(0);
                    JsonNode messageNode = firstChoice.get("message");
                    if (messageNode != null) {
                        return messageNode.get("content").asText();
                    }
                }
            }

            log.warn("Unexpected API response: {}", response.getBody());
            return null;

        } catch (Exception e) {
            log.error("Error calling DeepSeek API", e);
            throw new RuntimeException("Failed to call AI API", e);
        }
    }
}
