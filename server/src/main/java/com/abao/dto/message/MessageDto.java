package com.abao.dto.message;

import com.abao.entity.Message;
import com.abao.entity.MessageType;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class MessageDto {
    private UUID id;
    private UUID groupId;
    private UUID senderId;
    private String senderNickname;
    private String content;
    private MessageType messageType;
    private UUID replyToId;
    private String replyToContent;
    private LocalDateTime createdAt;

    public static MessageDto fromEntity(Message message) {
        MessageDto dto = new MessageDto();
        dto.setId(message.getId());
        dto.setGroupId(message.getGroup().getId());
        dto.setContent(message.getContent());
        dto.setMessageType(message.getMessageType());
        dto.setCreatedAt(message.getCreatedAt());

        if (message.getSender() != null) {
            dto.setSenderId(message.getSender().getId());
            dto.setSenderNickname(message.getSender().getNickname());
        }

        if (message.getReplyTo() != null) {
            dto.setReplyToId(message.getReplyTo().getId());
            dto.setReplyToContent(truncateContent(message.getReplyTo().getContent(), 50));
        }

        return dto;
    }

    private static String truncateContent(String content, int maxLength) {
        if (content == null) return null;
        if (content.length() <= maxLength) return content;
        return content.substring(0, maxLength) + "...";
    }
}
