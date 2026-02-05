package com.abao.dto.group;

import com.abao.entity.Group;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GroupDetailDto {
    private UUID id;
    private String name;
    private String inviteCode;
    private List<GroupMemberDto> members;
    private LocalDateTime createdAt;

    public static GroupDetailDto fromEntity(Group group) {
        GroupDetailDto dto = new GroupDetailDto();
        dto.setId(group.getId());
        dto.setName(group.getName());
        dto.setInviteCode(group.getInviteCode());
        dto.setCreatedAt(group.getCreatedAt());

        if (group.getMembers() != null) {
            dto.setMembers(group.getMembers().stream()
                .map(GroupMemberDto::fromEntity)
                .collect(Collectors.toList()));
        }

        return dto;
    }
}
