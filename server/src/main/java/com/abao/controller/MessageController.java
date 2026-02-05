package com.abao.controller;

import com.abao.dto.message.MessageDto;
import com.abao.entity.User;
import com.abao.service.MessageService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/messages")
@RequiredArgsConstructor
public class MessageController {

    private final MessageService messageService;

    /**
     * Get paginated messages for a group
     */
    @GetMapping("/group/{groupId}")
    public ResponseEntity<Page<MessageDto>> getMessages(
        @PathVariable UUID groupId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size
    ) {
        Pageable pageable = PageRequest.of(page, Math.min(size, 100));
        Page<MessageDto> messages = messageService.getMessages(groupId, pageable);
        return ResponseEntity.ok(messages);
    }

    /**
     * Get recent messages for a group (for initial load)
     */
    @GetMapping("/group/{groupId}/recent")
    public ResponseEntity<List<MessageDto>> getRecentMessages(
        @PathVariable UUID groupId,
        @RequestParam(defaultValue = "50") int limit
    ) {
        List<MessageDto> messages = messageService.getRecentMessages(groupId, Math.min(limit, 100));
        return ResponseEntity.ok(messages);
    }

    /**
     * Get a single message by ID
     */
    @GetMapping("/{messageId}")
    public ResponseEntity<MessageDto> getMessage(@PathVariable UUID messageId) {
        MessageDto message = messageService.getMessage(messageId);
        if (message == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(message);
    }

    /**
     * Send a message via REST (alternative to WebSocket)
     */
    @PostMapping("/group/{groupId}")
    public ResponseEntity<MessageDto> sendMessage(
        @AuthenticationPrincipal User user,
        @PathVariable UUID groupId,
        @RequestBody Map<String, String> request
    ) {
        String content = request.get("content");
        String replyToIdStr = request.get("replyToId");

        if (content == null || content.trim().isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        UUID replyToId = null;
        if (replyToIdStr != null && !replyToIdStr.isEmpty()) {
            replyToId = UUID.fromString(replyToIdStr);
        }

        MessageDto message = messageService.sendMessage(user, groupId, content.trim(), replyToId);
        return ResponseEntity.ok(message);
    }
}
