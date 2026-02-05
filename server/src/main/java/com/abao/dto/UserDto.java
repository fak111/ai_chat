package com.abao.dto;

import com.abao.entity.User;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserDto {
    private UUID id;
    private String email;
    private String nickname;
    private String avatarUrl;
    private LocalDateTime createdAt;

    public static UserDto fromEntity(User user) {
        return new UserDto(
            user.getId(),
            user.getEmail(),
            user.getNickname(),
            user.getAvatarUrl(),
            user.getCreatedAt()
        );
    }

    public String getDisplayName() {
        return nickname != null && !nickname.isEmpty()
            ? nickname
            : email.split("@")[0];
    }
}
