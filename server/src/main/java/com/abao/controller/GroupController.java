package com.abao.controller;

import com.abao.dto.group.*;
import com.abao.entity.User;
import com.abao.service.GroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
public class GroupController {

    private final GroupService groupService;

    @PostMapping
    public ResponseEntity<GroupDto> createGroup(
        @Valid @RequestBody CreateGroupRequest request,
        @AuthenticationPrincipal User user
    ) {
        GroupDto group = groupService.createGroup(request, user);
        return ResponseEntity.ok(group);
    }

    @PostMapping("/join")
    public ResponseEntity<GroupDto> joinGroup(
        @Valid @RequestBody JoinGroupRequest request,
        @AuthenticationPrincipal User user
    ) {
        GroupDto group = groupService.joinGroup(request, user);
        return ResponseEntity.ok(group);
    }

    @GetMapping
    public ResponseEntity<List<GroupDto>> getMyGroups(@AuthenticationPrincipal User user) {
        List<GroupDto> groups = groupService.getUserGroups(user);
        return ResponseEntity.ok(groups);
    }

    @GetMapping("/{groupId}")
    public ResponseEntity<GroupDetailDto> getGroupDetail(
        @PathVariable UUID groupId,
        @AuthenticationPrincipal User user
    ) {
        GroupDetailDto group = groupService.getGroupDetail(groupId, user);
        return ResponseEntity.ok(group);
    }

    @GetMapping("/{groupId}/invite")
    public ResponseEntity<Map<String, String>> getInviteCode(
        @PathVariable UUID groupId,
        @AuthenticationPrincipal User user
    ) {
        String inviteCode = groupService.getInviteCode(groupId, user);
        return ResponseEntity.ok(Map.of("inviteCode", inviteCode));
    }

    @DeleteMapping("/{groupId}/leave")
    public ResponseEntity<Map<String, String>> leaveGroup(
        @PathVariable UUID groupId,
        @AuthenticationPrincipal User user
    ) {
        groupService.leaveGroup(groupId, user);
        return ResponseEntity.ok(Map.of("message", "已退出群聊"));
    }
}
