package com.abao.dto.group;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateGroupRequest {

    @NotBlank(message = "群聊名称不能为空")
    @Size(min = 1, max = 50, message = "群聊名称长度为1-50个字符")
    private String name;
}
