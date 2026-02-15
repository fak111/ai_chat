package com.abao.integration;

import com.abao.dto.auth.LoginRequest;
import com.abao.dto.auth.RegisterRequest;
import com.abao.dto.group.CreateGroupRequest;
import com.abao.dto.group.JoinGroupRequest;
import com.abao.entity.User;
import com.abao.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GroupIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    private String accessToken;
    private String accessToken2;

    @BeforeEach
    void setUp() throws Exception {
        accessToken = registerVerifyAndGetToken("grouptest1_" + System.currentTimeMillis() + "@example.com");
        accessToken2 = registerVerifyAndGetToken("grouptest2_" + System.currentTimeMillis() + "@example.com");
    }

    /**
     * 注册 → 手动验证邮箱 → 登录获取 token
     */
    private String registerVerifyAndGetToken(String email) throws Exception {
        // 1. Register
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("Password123!");
        request.setNickname("TestUser");

        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk());

        // 2. 手动验证邮箱
        User user = userRepository.findByEmail(email).orElseThrow();
        user.setEmailVerified(true);
        user.setVerificationToken(null);
        userRepository.save(user);

        // 3. Login 获取 token
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmail(email);
        loginRequest.setPassword("Password123!");

        MvcResult result = mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(loginRequest)))
            .andExpect(status().isOk())
            .andReturn();

        return objectMapper.readTree(result.getResponse().getContentAsString())
            .get("accessToken").asText();
    }

    @Test
    void createGroup_Success() throws Exception {
        CreateGroupRequest request = new CreateGroupRequest();
        request.setName("Test Group");

        mockMvc.perform(post("/api/groups")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Test Group"))
            .andExpect(jsonPath("$.inviteCode").exists())
            .andExpect(jsonPath("$.memberCount").value(1));
    }

    @Test
    void joinGroup_WithValidInviteCode_Success() throws Exception {
        // User 1 creates a group
        CreateGroupRequest createRequest = new CreateGroupRequest();
        createRequest.setName("Join Test Group");

        MvcResult createResult = mockMvc.perform(post("/api/groups")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
            .andExpect(status().isOk())
            .andReturn();

        String inviteCode = objectMapper.readTree(createResult.getResponse().getContentAsString())
            .get("inviteCode").asText();

        // User 2 joins the group
        JoinGroupRequest joinRequest = new JoinGroupRequest();
        joinRequest.setInviteCode(inviteCode);

        mockMvc.perform(post("/api/groups/join")
                .header("Authorization", "Bearer " + accessToken2)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(joinRequest)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Join Test Group"))
            .andExpect(jsonPath("$.memberCount").value(2));
    }

    @Test
    void joinGroup_WithInvalidInviteCode_ReturnsBadRequest() throws Exception {
        JoinGroupRequest request = new JoinGroupRequest();
        request.setInviteCode("INVALID123");

        mockMvc.perform(post("/api/groups/join")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void listGroups_ReturnsUserGroups() throws Exception {
        // Create a group
        CreateGroupRequest request = new CreateGroupRequest();
        request.setName("List Test Group");

        mockMvc.perform(post("/api/groups")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk());

        // List groups
        mockMvc.perform(get("/api/groups")
                .header("Authorization", "Bearer " + accessToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.groups").isArray());
    }
}
