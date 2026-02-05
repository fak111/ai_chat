package com.abao.integration;

import com.abao.dto.auth.RegisterRequest;
import com.abao.dto.group.CreateGroupRequest;
import com.abao.dto.group.JoinGroupRequest;
import com.fasterxml.jackson.databind.JsonNode;
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

    private String accessToken;
    private String accessToken2;

    @BeforeEach
    void setUp() throws Exception {
        // Create first user
        accessToken = registerAndGetToken("grouptest1_" + System.currentTimeMillis() + "@example.com");
        // Create second user
        accessToken2 = registerAndGetToken("grouptest2_" + System.currentTimeMillis() + "@example.com");
    }

    private String registerAndGetToken(String email) throws Exception {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("Password123!");
        request.setNickname("TestUser");

        MvcResult result = mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
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
