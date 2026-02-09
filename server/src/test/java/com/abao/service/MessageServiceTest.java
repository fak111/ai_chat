package com.abao.service;

import com.abao.dto.message.MessageDto;
import com.abao.entity.*;
import com.abao.repository.GroupRepository;
import com.abao.repository.MessageRepository;
import com.abao.websocket.WebSocketSessionManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageServiceTest {

    @Mock
    private MessageRepository messageRepository;

    @Mock
    private GroupRepository groupRepository;

    @Mock
    private WebSocketSessionManager sessionManager;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private MessageService messageService;

    private User testUser;
    private Group testGroup;
    private UUID groupId;

    @BeforeEach
    void setUp() {
        testUser = new User();
        testUser.setId(UUID.randomUUID());
        testUser.setEmail("test@example.com");
        testUser.setNickname("TestUser");

        groupId = UUID.randomUUID();
        testGroup = new Group();
        testGroup.setId(groupId);
        testGroup.setName("Test Group");
        testGroup.setMembers(new ArrayList<>());

        GroupMember member = new GroupMember();
        member.setUser(testUser);
        member.setGroup(testGroup);
        testGroup.getMembers().add(member);
    }

    @Test
    void sendMessage_Success() {
        // Given
        String content = "Hello, World!";
        when(groupRepository.findById(groupId)).thenReturn(Optional.of(testGroup));
        when(messageRepository.save(any(Message.class))).thenAnswer(invocation -> {
            Message msg = invocation.getArgument(0);
            msg.setId(UUID.randomUUID());
            msg.setCreatedAt(LocalDateTime.now());
            return msg;
        });

        // When
        MessageDto result = messageService.sendMessage(testUser, groupId, content, null);

        // Then
        assertThat(result).isNotNull();
        assertThat(result.getContent()).isEqualTo(content);
        assertThat(result.getSenderId()).isEqualTo(testUser.getId());
        assertThat(result.getGroupId()).isEqualTo(groupId);
        assertThat(result.getMessageType()).isEqualTo(MessageType.USER);

        // Verify broadcast was called
        verify(sessionManager).broadcastToGroup(eq(groupId), any());
    }

    @Test
    void sendMessage_WithReplyTo() {
        // Given
        String content = "Reply message";
        UUID replyToId = UUID.randomUUID();

        Message originalMessage = new Message();
        originalMessage.setId(replyToId);
        originalMessage.setContent("Original message");
        originalMessage.setGroup(testGroup);
        originalMessage.setSender(testUser);

        when(groupRepository.findById(groupId)).thenReturn(Optional.of(testGroup));
        when(messageRepository.findById(replyToId)).thenReturn(Optional.of(originalMessage));
        when(messageRepository.save(any(Message.class))).thenAnswer(invocation -> {
            Message msg = invocation.getArgument(0);
            msg.setId(UUID.randomUUID());
            msg.setCreatedAt(LocalDateTime.now());
            return msg;
        });

        // When
        MessageDto result = messageService.sendMessage(testUser, groupId, content, replyToId);

        // Then
        assertThat(result).isNotNull();
        assertThat(result.getReplyToId()).isEqualTo(replyToId);
        assertThat(result.getReplyToContent()).isEqualTo("Original message");
    }

    @Test
    void sendMessage_GroupNotFound_ThrowsException() {
        // Given
        when(groupRepository.findById(groupId)).thenReturn(Optional.empty());

        // When/Then
        assertThatThrownBy(() -> messageService.sendMessage(testUser, groupId, "Hello", null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Group not found");
    }

    @Test
    void sendMessage_UserNotMember_ThrowsException() {
        // Given
        testGroup.setMembers(new ArrayList<>()); // Empty members
        when(groupRepository.findById(groupId)).thenReturn(Optional.of(testGroup));

        // When/Then
        assertThatThrownBy(() -> messageService.sendMessage(testUser, groupId, "Hello", null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("not a member");
    }

    @Test
    void getMessages_Success() {
        // Given
        Message message1 = createTestMessage(testGroup, testUser, "Message 1");
        Message message2 = createTestMessage(testGroup, testUser, "Message 2");

        Page<Message> page = new PageImpl<>(Arrays.asList(message1, message2));
        when(messageRepository.findByGroupIdOrderByCreatedAtDesc(eq(groupId), any(Pageable.class)))
            .thenReturn(page);

        // When
        Page<MessageDto> result = messageService.getMessages(groupId, PageRequest.of(0, 20));

        // Then
        assertThat(result.getContent()).hasSize(2);
        assertThat(result.getContent().get(0).getContent()).isEqualTo("Message 1");
    }

    @Test
    void getRecentMessages_Success() {
        // Given
        Message message1 = createTestMessage(testGroup, testUser, "Recent 1");
        Message message2 = createTestMessage(testGroup, testUser, "Recent 2");

        when(messageRepository.findRecentByGroupId(groupId, 50))
            .thenReturn(Arrays.asList(message1, message2));

        // When
        List<MessageDto> result = messageService.getRecentMessages(groupId, 50);

        // Then
        assertThat(result).hasSize(2);
    }

    @Test
    void sendSystemMessage_Success() {
        // Given
        String content = "User joined the group";
        when(groupRepository.findById(groupId)).thenReturn(Optional.of(testGroup));
        when(messageRepository.save(any(Message.class))).thenAnswer(invocation -> {
            Message msg = invocation.getArgument(0);
            msg.setId(UUID.randomUUID());
            msg.setCreatedAt(LocalDateTime.now());
            return msg;
        });

        // When
        MessageDto result = messageService.sendSystemMessage(groupId, content);

        // Then
        assertThat(result).isNotNull();
        assertThat(result.getContent()).isEqualTo(content);
        assertThat(result.getMessageType()).isEqualTo(MessageType.SYSTEM);
        assertThat(result.getSenderId()).isNull();
    }

    private Message createTestMessage(Group group, User sender, String content) {
        Message message = new Message();
        message.setId(UUID.randomUUID());
        message.setGroup(group);
        message.setSender(sender);
        message.setContent(content);
        message.setMessageType(MessageType.USER);
        message.setCreatedAt(LocalDateTime.now());
        return message;
    }
}
