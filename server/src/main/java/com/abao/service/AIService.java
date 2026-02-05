package com.abao.service;

import com.abao.dto.message.MessageDto;
import com.abao.entity.Message;
import com.abao.entity.MessageType;
import com.abao.repository.MessageRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class AIService {

    private final MessageRepository messageRepository;
    private final MessageService messageService;
    private final ObjectMapper objectMapper;

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

    private static final Pattern AI_MENTION_PATTERN = Pattern.compile("@[Aa][Ii]\\b");
    private static final int CONTEXT_MESSAGE_LIMIT = 10;

    private static final String SYSTEM_PROMPT = """
        你是 A宝，一个友好、有帮助的 AI 助手，在群聊中与用户互动。

        规则：
        1. 保持回复简洁友好，适合群聊场景
        2. 如果用户用中文提问，用中文回复；英文提问用英文回复
        3. 不要在回复中提及你是 AI 或机器人，除非被直接问到
        4. 如果不确定答案，诚实地说不知道
        5. 避免过长的回复，保持对话自然流畅
        """;

    /**
     * Check if a message contains @AI mention
     */
    public boolean containsAIMention(String content) {
        if (content == null) return false;
        return AI_MENTION_PATTERN.matcher(content).find();
    }

    /**
     * Extract the user's actual message by removing @AI mention
     */
    public String extractUserMessage(String content) {
        if (content == null) return "";
        return AI_MENTION_PATTERN.matcher(content).replaceAll("").trim();
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
     * Build conversation context for AI
     */
    public List<Map<String, String>> buildContext(UUID groupId, Message triggerMessage) {
        List<Map<String, String>> messages = new ArrayList<>();

        // Add system prompt
        messages.add(Map.of("role", "system", "content", SYSTEM_PROMPT));

        // Get recent messages for context
        List<Message> recentMessages = messageRepository.findRecentByGroupId(groupId, CONTEXT_MESSAGE_LIMIT);

        // Reverse to get chronological order
        Collections.reverse(recentMessages);

        // Build conversation history
        for (Message msg : recentMessages) {
            String role;
            String content = msg.getContent();

            switch (msg.getMessageType()) {
                case AI -> role = "assistant";
                case USER -> {
                    role = "user";
                    // Include sender name for context
                    String senderName = msg.getSender() != null ? msg.getSender().getNickname() : "Unknown";
                    content = senderName + ": " + extractUserMessage(content);
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
     * Process a message and generate AI response if needed
     */
    @Async
    public void processMessage(Message message) {
        if (!shouldTriggerAI(message)) {
            return;
        }

        try {
            UUID groupId = message.getGroup().getId();
            List<Map<String, String>> context = buildContext(groupId, message);

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
     * Call DeepSeek API to get AI response
     */
    private String callDeepSeekAPI(List<Map<String, String>> messages) {
        if (apiKey == null || apiKey.isEmpty()) {
            log.warn("DeepSeek API key not configured");
            return "AI 服务未配置，请联系管理员。";
        }

        try {
            RestTemplate restTemplate = new RestTemplate();

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
