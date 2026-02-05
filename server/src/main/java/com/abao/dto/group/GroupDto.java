package com.abao.dto.group;

import com.abao.entity.Group;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GroupDto {
    private UUID id;
    private String name;
    private String inviteCode;
    private int memberCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // For list display
    private String lastMessage;
    private LocalDateTime lastMessageAt;
    private int unreadCount;

    public static GroupDto fromEntity(Group group) {
        GroupDto dto = new GroupDto();
        dto.setId(group.getId());
        dto.setName(group.getName());
        dto.setInviteCode(group.getInviteCode());
        dto.setMemberCount(group.getMembers() != null ? group.getMembers().size() : 0);
        dto.setCreatedAt(group.getCreatedAt());
        dto.setUpdatedAt(group.getUpdatedAt());
        return dto;
    }
}
