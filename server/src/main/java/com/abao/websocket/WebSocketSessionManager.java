package com.abao.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketSessionManager {

    private final ObjectMapper objectMapper;

    // userId -> WebSocketSession
    private final Map<UUID, WebSocketSession> userSessions = new ConcurrentHashMap<>();

    // groupId -> Set<userId>
    private final Map<UUID, Set<UUID>> groupMembers = new ConcurrentHashMap<>();

    // userId -> Set<groupId>
    private final Map<UUID, Set<UUID>> userGroups = new ConcurrentHashMap<>();

    public void addSession(UUID userId, WebSocketSession session) {
        userSessions.put(userId, session);
    }

    public void removeSession(UUID userId) {
        userSessions.remove(userId);

        // Remove from all groups
        Set<UUID> groups = userGroups.remove(userId);
        if (groups != null) {
            for (UUID groupId : groups) {
                Set<UUID> members = groupMembers.get(groupId);
                if (members != null) {
                    members.remove(userId);
                }
            }
        }
    }

    public void joinGroup(UUID userId, UUID groupId) {
        groupMembers.computeIfAbsent(groupId, k -> ConcurrentHashMap.newKeySet()).add(userId);
        userGroups.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet()).add(groupId);
    }

    public void leaveGroup(UUID userId, UUID groupId) {
        Set<UUID> members = groupMembers.get(groupId);
        if (members != null) {
            members.remove(userId);
        }

        Set<UUID> groups = userGroups.get(userId);
        if (groups != null) {
            groups.remove(groupId);
        }
    }

    public void broadcastToGroup(UUID groupId, Object message) {
        Set<UUID> members = groupMembers.get(groupId);
        if (members == null || members.isEmpty()) {
            return;
        }

        String messageJson;
        try {
            messageJson = objectMapper.writeValueAsString(message);
        } catch (Exception e) {
            log.error("Error serializing message", e);
            return;
        }

        TextMessage textMessage = new TextMessage(messageJson);

        for (UUID userId : members) {
            WebSocketSession session = userSessions.get(userId);
            if (session != null && session.isOpen()) {
                try {
                    session.sendMessage(textMessage);
                } catch (IOException e) {
                    log.error("Error sending message to user {}", userId, e);
                }
            }
        }
    }

    public void sendToUser(UUID userId, Object message) {
        WebSocketSession session = userSessions.get(userId);
        if (session == null || !session.isOpen()) {
            return;
        }

        try {
            String messageJson = objectMapper.writeValueAsString(message);
            session.sendMessage(new TextMessage(messageJson));
        } catch (Exception e) {
            log.error("Error sending message to user {}", userId, e);
        }
    }

    public boolean isUserOnline(UUID userId) {
        WebSocketSession session = userSessions.get(userId);
        return session != null && session.isOpen();
    }

    public Set<UUID> getOnlineGroupMembers(UUID groupId) {
        Set<UUID> members = groupMembers.get(groupId);
        if (members == null) {
            return Collections.emptySet();
        }

        Set<UUID> online = new HashSet<>();
        for (UUID userId : members) {
            if (isUserOnline(userId)) {
                online.add(userId);
            }
        }
        return online;
    }
}
