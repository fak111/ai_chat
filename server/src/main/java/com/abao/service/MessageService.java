package com.abao.service;

import com.abao.dto.message.MessageDto;
import com.abao.entity.*;
import com.abao.event.MessageSentEvent;
import com.abao.repository.GroupRepository;
import com.abao.repository.MessageRepository;
import com.abao.websocket.WebSocketSessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class MessageService {

    private final MessageRepository messageRepository;
    private final GroupRepository groupRepository;
    private final WebSocketSessionManager sessionManager;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public MessageDto sendMessage(User sender, UUID groupId, String content, UUID replyToId) {
        Group group = groupRepository.findById(groupId)
            .orElseThrow(() -> new IllegalArgumentException("Group not found: " + groupId));

        // Check if user is a member
        boolean isMember = group.getMembers().stream()
            .anyMatch(m -> m.getUser().getId().equals(sender.getId()));

        if (!isMember) {
            throw new IllegalArgumentException("User is not a member of this group");
        }

        Message message = new Message();
        message.setGroup(group);
        message.setSender(sender);
        message.setContent(content);
        message.setMessageType(MessageType.USER);

        // Handle reply
        if (replyToId != null) {
            Message replyTo = messageRepository.findById(replyToId).orElse(null);
            message.setReplyTo(replyTo);
        }

        Message saved = messageRepository.save(message);
        MessageDto dto = MessageDto.fromEntity(saved);

        // Broadcast to group members via WebSocket
        broadcastMessage(groupId, dto);

        log.info("Message sent: groupId={}, senderId={}, messageId={}",
            groupId, sender.getId(), saved.getId());

        // Publish event for AI processing
        eventPublisher.publishEvent(new MessageSentEvent(this, saved));

        return dto;
    }

    @Transactional
    public MessageDto sendSystemMessage(UUID groupId, String content) {
        Group group = groupRepository.findById(groupId)
            .orElseThrow(() -> new IllegalArgumentException("Group not found: " + groupId));

        Message message = new Message();
        message.setGroup(group);
        message.setSender(null);
        message.setContent(content);
        message.setMessageType(MessageType.SYSTEM);

        Message saved = messageRepository.save(message);
        MessageDto dto = MessageDto.fromEntity(saved);

        // Broadcast to group members
        broadcastMessage(groupId, dto);

        log.info("System message sent: groupId={}, messageId={}", groupId, saved.getId());

        return dto;
    }

    @Transactional
    public MessageDto sendAIMessage(UUID groupId, String content, UUID replyToId) {
        Group group = groupRepository.findById(groupId)
            .orElseThrow(() -> new IllegalArgumentException("Group not found: " + groupId));

        Message message = new Message();
        message.setGroup(group);
        message.setSender(null); // AI has no user sender
        message.setContent(content);
        message.setMessageType(MessageType.AI);

        if (replyToId != null) {
            Message replyTo = messageRepository.findById(replyToId).orElse(null);
            message.setReplyTo(replyTo);
        }

        Message saved = messageRepository.save(message);
        MessageDto dto = MessageDto.fromEntity(saved);

        // Broadcast to group members
        broadcastMessage(groupId, dto);

        log.info("AI message sent: groupId={}, messageId={}", groupId, saved.getId());

        return dto;
    }

    @Transactional(readOnly = true)
    public Page<MessageDto> getMessages(UUID groupId, Pageable pageable) {
        return messageRepository.findByGroupIdOrderByCreatedAtDesc(groupId, pageable)
            .map(MessageDto::fromEntity);
    }

    @Transactional(readOnly = true)
    public List<MessageDto> getRecentMessages(UUID groupId, int limit) {
        return messageRepository.findRecentByGroupId(groupId, limit).stream()
            .map(MessageDto::fromEntity)
            .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public MessageDto getMessage(UUID messageId) {
        return messageRepository.findById(messageId)
            .map(MessageDto::fromEntity)
            .orElse(null);
    }

    private void broadcastMessage(UUID groupId, MessageDto messageDto) {
        Map<String, Object> wsMessage = Map.of(
            "type", "NEW_MESSAGE",
            "message", messageDto
        );
        sessionManager.broadcastToGroup(groupId, wsMessage);
    }
}
