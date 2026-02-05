package com.abao.websocket;

import com.abao.entity.User;
import com.abao.service.MessageService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketHandler extends TextWebSocketHandler {

    private final MessageService messageService;
    private final ObjectMapper objectMapper;
    private final WebSocketSessionManager sessionManager;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        User user = (User) session.getAttributes().get("user");
        if (user != null) {
            sessionManager.addSession(user.getId(), session);
            log.info("WebSocket connected: user={}", user.getId());
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        User user = (User) session.getAttributes().get("user");
        if (user == null) {
            sendError(session, "Unauthorized");
            return;
        }

        try {
            JsonNode json = objectMapper.readTree(message.getPayload());
            String type = json.has("type") ? json.get("type").asText() : "";

            switch (type) {
                case "SEND_MESSAGE" -> handleSendMessage(session, user, json);
                case "JOIN_GROUP" -> handleJoinGroup(session, user, json);
                case "LEAVE_GROUP" -> handleLeaveGroup(session, user, json);
                case "PING" -> handlePing(session);
                default -> sendError(session, "Unknown message type: " + type);
            }
        } catch (Exception e) {
            log.error("Error handling WebSocket message", e);
            sendError(session, "Error processing message");
        }
    }

    private void handleSendMessage(WebSocketSession session, User user, JsonNode json) {
        String groupIdStr = json.has("groupId") ? json.get("groupId").asText() : null;
        String content = json.has("content") ? json.get("content").asText() : null;
        String replyToIdStr = json.has("replyToId") ? json.get("replyToId").asText() : null;

        if (groupIdStr == null || content == null || content.trim().isEmpty()) {
            sendError(session, "Missing groupId or content");
            return;
        }

        UUID groupId = UUID.fromString(groupIdStr);
        UUID replyToId = replyToIdStr != null && !replyToIdStr.isEmpty()
            ? UUID.fromString(replyToIdStr)
            : null;

        messageService.sendMessage(user, groupId, content.trim(), replyToId);
    }

    private void handleJoinGroup(WebSocketSession session, User user, JsonNode json) {
        String groupIdStr = json.has("groupId") ? json.get("groupId").asText() : null;
        if (groupIdStr == null) {
            sendError(session, "Missing groupId");
            return;
        }

        UUID groupId = UUID.fromString(groupIdStr);
        sessionManager.joinGroup(user.getId(), groupId);

        sendMessage(session, Map.of(
            "type", "JOINED_GROUP",
            "groupId", groupId.toString()
        ));
    }

    private void handleLeaveGroup(WebSocketSession session, User user, JsonNode json) {
        String groupIdStr = json.has("groupId") ? json.get("groupId").asText() : null;
        if (groupIdStr == null) {
            sendError(session, "Missing groupId");
            return;
        }

        UUID groupId = UUID.fromString(groupIdStr);
        sessionManager.leaveGroup(user.getId(), groupId);

        sendMessage(session, Map.of(
            "type", "LEFT_GROUP",
            "groupId", groupId.toString()
        ));
    }

    private void handlePing(WebSocketSession session) {
        sendMessage(session, Map.of("type", "PONG"));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        User user = (User) session.getAttributes().get("user");
        if (user != null) {
            sessionManager.removeSession(user.getId());
            log.info("WebSocket disconnected: user={}", user.getId());
        }
    }

    private void sendError(WebSocketSession session, String error) {
        sendMessage(session, Map.of(
            "type", "ERROR",
            "message", error
        ));
    }

    private void sendMessage(WebSocketSession session, Object message) {
        try {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(message)));
        } catch (IOException e) {
            log.error("Error sending WebSocket message", e);
        }
    }
}
