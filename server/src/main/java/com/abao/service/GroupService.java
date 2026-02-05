package com.abao.service;

import com.abao.dto.group.*;
import com.abao.entity.Group;
import com.abao.entity.GroupMember;
import com.abao.entity.Message;
import com.abao.entity.User;
import com.abao.repository.GroupMemberRepository;
import com.abao.repository.GroupRepository;
import com.abao.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class GroupService {

    private final GroupRepository groupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final MessageRepository messageRepository;

    private static final String INVITE_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int INVITE_CODE_LENGTH = 6;
    private final SecureRandom random = new SecureRandom();

    @Transactional
    public GroupDto createGroup(CreateGroupRequest request, User creator) {
        // Generate unique invite code
        String inviteCode = generateUniqueInviteCode();

        // Create group
        Group group = new Group();
        group.setName(request.getName());
        group.setInviteCode(inviteCode);
        group = groupRepository.save(group);

        // Add creator as member
        GroupMember creatorMember = new GroupMember();
        creatorMember.setGroup(group);
        creatorMember.setUser(creator);
        creatorMember.setIsAi(false);
        groupMemberRepository.save(creatorMember);

        // Add AI as member
        GroupMember aiMember = new GroupMember();
        aiMember.setGroup(group);
        aiMember.setUser(null); // AI has no user
        aiMember.setIsAi(true);
        groupMemberRepository.save(aiMember);

        log.info("Group created: {} by user {}", group.getId(), creator.getId());

        GroupDto dto = GroupDto.fromEntity(group);
        dto.setMemberCount(2); // Creator + AI
        return dto;
    }

    @Transactional
    public GroupDto joinGroup(JoinGroupRequest request, User user) {
        Group group = groupRepository.findByInviteCode(request.getInviteCode().toUpperCase())
            .orElseThrow(() -> new RuntimeException("邀请码无效"));

        // Check if already a member
        if (groupMemberRepository.existsByGroupIdAndUserId(group.getId(), user.getId())) {
            throw new RuntimeException("您已在该群聊中");
        }

        // Add user as member
        GroupMember member = new GroupMember();
        member.setGroup(group);
        member.setUser(user);
        member.setIsAi(false);
        groupMemberRepository.save(member);

        log.info("User {} joined group {}", user.getId(), group.getId());

        GroupDto dto = GroupDto.fromEntity(group);
        dto.setMemberCount((int) groupMemberRepository.countByGroupId(group.getId()));
        return dto;
    }

    @Transactional(readOnly = true)
    public List<GroupDto> getUserGroups(User user) {
        List<Group> groups = groupRepository.findByUserIdOrderByUpdatedAtDesc(user.getId());

        return groups.stream().map(group -> {
            GroupDto dto = GroupDto.fromEntity(group);
            dto.setMemberCount((int) groupMemberRepository.countByGroupId(group.getId()));

            // Get last message
            messageRepository.findLatestByGroupId(group.getId()).ifPresent(msg -> {
                String preview = msg.getContent();
                if (preview.length() > 50) {
                    preview = preview.substring(0, 50) + "...";
                }
                String senderName = msg.getSender() != null
                    ? msg.getSender().getDisplayName()
                    : "AI";
                dto.setLastMessage(senderName + ": " + preview);
                dto.setLastMessageAt(msg.getCreatedAt());
            });

            return dto;
        }).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public GroupDetailDto getGroupDetail(UUID groupId, User user) {
        Group group = groupRepository.findById(groupId)
            .orElseThrow(() -> new RuntimeException("群聊不存在"));

        // Check if user is member
        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, user.getId())) {
            throw new RuntimeException("您不是该群聊成员");
        }

        return GroupDetailDto.fromEntity(group);
    }

    @Transactional(readOnly = true)
    public String getInviteCode(UUID groupId, User user) {
        Group group = groupRepository.findById(groupId)
            .orElseThrow(() -> new RuntimeException("群聊不存在"));

        // Check if user is member
        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, user.getId())) {
            throw new RuntimeException("您不是该群聊成员");
        }

        return group.getInviteCode();
    }

    @Transactional
    public void leaveGroup(UUID groupId, User user) {
        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, user.getId())) {
            throw new RuntimeException("您不是该群聊成员");
        }

        groupMemberRepository.findByGroupIdAndUserId(groupId, user.getId())
            .ifPresent(groupMemberRepository::delete);

        log.info("User {} left group {}", user.getId(), groupId);
    }

    private String generateUniqueInviteCode() {
        String code;
        int attempts = 0;
        do {
            code = generateInviteCode();
            attempts++;
            if (attempts > 100) {
                throw new RuntimeException("无法生成唯一邀请码");
            }
        } while (groupRepository.existsByInviteCode(code));
        return code;
    }

    private String generateInviteCode() {
        StringBuilder code = new StringBuilder(INVITE_CODE_LENGTH);
        for (int i = 0; i < INVITE_CODE_LENGTH; i++) {
            code.append(INVITE_CODE_CHARS.charAt(random.nextInt(INVITE_CODE_CHARS.length())));
        }
        return code.toString();
    }
}
