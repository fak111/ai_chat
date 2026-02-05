package com.abao.dto.group;

import com.abao.entity.GroupMember;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GroupMemberDto {
    private UUID id;
    private UUID userId;
    private String nickname;
    private String avatarUrl;
    private boolean isAi;
    private LocalDateTime joinedAt;

    public static GroupMemberDto fromEntity(GroupMember member) {
        GroupMemberDto dto = new GroupMemberDto();
        dto.setId(member.getId());
        dto.setAi(member.getIsAi() != null && member.getIsAi());

        if (member.getUser() != null) {
            dto.setUserId(member.getUser().getId());
            dto.setNickname(member.getUser().getDisplayName());
            dto.setAvatarUrl(member.getUser().getAvatarUrl());
        } else if (dto.isAi()) {
            dto.setNickname("A宝助手");
        }

        dto.setJoinedAt(member.getJoinedAt());
        return dto;
    }
}
