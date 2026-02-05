package com.abao.dto.group;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class JoinGroupRequest {

    @NotBlank(message = "邀请码不能为空")
    @Size(min = 6, max = 10, message = "邀请码长度为6-10位")
    private String inviteCode;
}
