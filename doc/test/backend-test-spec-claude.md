# A宝 后端测试规范

> 最后更新: 2026-02-06 | 维护者: Claude

---

## 第一部分：现状盘点

### 1.1 测试文件清单

| 文件 | 类型 | 框架 | 用例数 | 说明 |
|------|------|------|--------|------|
| `AbaoApplicationTests.java` | 冒烟 | SpringBootTest | 1 | Spring 上下文加载 |
| `entity/UserEntityTest.java` | 实体 | DataJpaTest | 3 | 用户创建、字段、唯一约束 |
| `entity/GroupEntityTest.java` | 实体 | DataJpaTest | 2 | 群组创建、邀请码唯一 |
| `entity/MessageEntityTest.java` | 实体 | DataJpaTest | 3 | 消息类型：用户/AI/回复 |
| `service/AuthServiceTest.java` | 服务 | SpringBootTest + Transactional | 8 | 注册、登录、Token 刷新 |
| `service/MessageServiceTest.java` | 服务 | MockitoExtension | 6 | 发消息、分页、系统消息 |
| `service/AIServiceTest.java` | 服务 | MockitoExtension + Nested | 37 | 上下文构建、名字清洗、系统提示词 |
| `integration/AuthIntegrationTest.java` | 集成 | MockMvc | 5 | 注册登录全流程、Token 校验 |
| `integration/GroupIntegrationTest.java` | 集成 | MockMvc | 4 | 群组 CRUD、邀请码加入 |
| `scripts/api_test.sh` | E2E 脚本 | curl + psql | 32 | 后端先行验证法 |

**合计：9 个 Java 测试文件，~69 个 Java 用例 + 32 个 Shell 用例**

### 1.2 技术栈

| 工具 | 用途 |
|------|------|
| JUnit 5 (Jupiter) | 测试框架 |
| Mockito + @Mock/@InjectMocks | 服务层 Mock |
| AssertJ | 断言（isNotNull, isEqualTo） |
| Spring Boot Test | @SpringBootTest, @DataJpaTest |
| MockMvc | HTTP 端点测试 |
| H2 (内存) | 测试数据库 |
| @ActiveProfiles("test") | 测试环境隔离 |
| ReflectionTestUtils | 私有字段注入 |

### 1.3 现有模式

**实体测试**：`@DataJpaTest` + `TestEntityManager`，验证 JPA 映射和约束

**服务单元测试**：`@ExtendWith(MockitoExtension.class)` + `@Mock` 依赖 + `@InjectMocks` 被测类

**集成测试**：`@SpringBootTest` + `@AutoConfigureMockMvc`，走完整 HTTP 链路

**数据隔离**：
- `@Transactional` 自动回滚
- `System.currentTimeMillis()` 生成唯一邮箱
- H2 `create-drop` 每次测试重建 Schema

### 1.4 现有不足

| 问题 | 影响 |
|------|------|
| Controller 层零测试 | 请求校验、序列化格式无法保证 |
| WebSocket 零测试 | 实时消息推送无覆盖 |
| 无覆盖率检查 | 不知道哪些分支没测到 |
| AuthServiceTest 用 @SpringBootTest | 太重，应该用 MockitoExtension |
| 无测试命名规范 | 方法名风格不统一 |
| api_test.sh 依赖 Docker 环境 | CI 中无法直接运行 |
| 异常路径覆盖不足 | GlobalExceptionHandler 无直接测试 |

---

## 第二部分：目标测试规范

### 2.1 测试金字塔

```
        ╱ E2E (api_test.sh / Testcontainers) ╲      ← 少而精，验证核心路径
       ╱    集成测试 (MockMvc + H2)            ╲     ← 每个 Controller 1 个
      ╱      服务单元测试 (Mockito)              ╲    ← 核心业务逻辑
     ╱        实体/工具/纯逻辑测试                  ╲   ← 最多最快
```

**比例目标**：单元 60% | 集成 30% | E2E 10%

### 2.2 目录结构规范

```
server/src/test/java/com/abao/
├── entity/                      # @DataJpaTest 实体测试
│   ├── UserEntityTest.java
│   ├── GroupEntityTest.java
│   └── MessageEntityTest.java
├── service/                     # @ExtendWith(MockitoExtension.class) 服务单元测试
│   ├── AuthServiceTest.java
│   ├── MessageServiceTest.java
│   ├── AIServiceTest.java
│   └── GroupServiceTest.java    ← 待补
├── controller/                  # @WebMvcTest Controller 切片测试
│   ├── AuthControllerTest.java  ← 待建
│   ├── GroupControllerTest.java ← 待建
│   └── MessageControllerTest.java ← 待建
├── integration/                 # @SpringBootTest 全链路集成测试
│   ├── AuthIntegrationTest.java
│   ├── GroupIntegrationTest.java
│   └── MessageIntegrationTest.java ← 待建
├── websocket/                   # WebSocket 测试
│   └── StompIntegrationTest.java ← 待建
├── config/                      # 安全配置测试
│   └── SecurityConfigTest.java  ← 待建
├── exception/                   # 异常处理测试
│   └── GlobalExceptionHandlerTest.java ← 待建
└── util/                        # 工具类、测试基类
    ├── TestDataFactory.java     ← 待建：测试数据工厂
    └── BaseIntegrationTest.java ← 待建：集成测试基类
```

### 2.3 命名规范

**测试类命名**：`{被测类名}Test.java`

**测试方法命名**：`should_期望行为_when_前置条件()`

```java
// Good
void should_ReturnToken_when_LoginWithValidCredentials()
void should_Throw404_when_GroupNotFound()
void should_RejectDuplicateEmail_when_Register()

// Bad (现有的，需逐步迁移)
void sendMessage_Success()
void registerAndLogin_Success()
```

**嵌套测试类**：用 `@Nested` 按场景分组

```java
@Nested
@DisplayName("注册")
class Register {
    @Test void should_CreateUser_when_ValidInput() { }
    @Test void should_Reject_when_DuplicateEmail() { }
    @Test void should_Reject_when_WeakPassword() { }
}
```

### 2.4 测试分层规范

#### 2.4.1 实体测试 (Entity)

```java
@DataJpaTest
@ActiveProfiles("test")
class UserEntityTest {
    @Autowired TestEntityManager em;

    @Test
    void should_PersistUser_when_AllRequiredFields() {
        User user = TestDataFactory.user();
        User saved = em.persistAndFlush(user);
        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getCreatedAt()).isNotNull();
    }
}
```

**规则**：
- 只测 JPA 映射、约束、审计字段
- 使用 `TestEntityManager`，不用 Repository
- 每个实体至少覆盖：创建、必填字段、唯一约束

#### 2.4.2 服务单元测试 (Service)

```java
@ExtendWith(MockitoExtension.class)
class MessageServiceTest {
    @Mock MessageRepository messageRepo;
    @Mock GroupRepository groupRepo;
    @InjectMocks MessageService messageService;

    @Test
    void should_SaveMessage_when_UserIsMember() {
        // Arrange
        given(groupRepo.findById(1L)).willReturn(Optional.of(testGroup));
        // Act
        MessageDto result = messageService.sendMessage(1L, sender, "hello", null);
        // Assert
        then(messageRepo).should().save(any(Message.class));
        assertThat(result.getContent()).isEqualTo("hello");
    }
}
```

**规则**：
- 严格 AAA 模式（Arrange-Act-Assert）
- Mock 所有外部依赖（Repository、RestTemplate、其他 Service）
- 用 `given/willReturn`（BDD Mockito）替代 `when/thenReturn`
- 用 `then().should()` 替代 `verify()`
- 私有字段用 `ReflectionTestUtils.setField()`

#### 2.4.3 Controller 切片测试

```java
@WebMvcTest(AuthController.class)
@Import(SecurityConfig.class)
class AuthControllerTest {
    @Autowired MockMvc mvc;
    @MockBean AuthService authService;
    @Autowired ObjectMapper mapper;

    @Test
    void should_Return200_when_RegisterSuccess() throws Exception {
        given(authService.register(any())).willReturn(new AuthResponse("token"));

        mvc.perform(post("/api/auth/register")
                .contentType(APPLICATION_JSON)
                .content(mapper.writeValueAsString(validRequest)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").exists());
    }

    @Test
    void should_Return400_when_EmailInvalid() throws Exception {
        mvc.perform(post("/api/auth/register")
                .contentType(APPLICATION_JSON)
                .content("{\"email\":\"bad\",\"password\":\"123\"}"))
            .andExpect(status().isBadRequest());
    }
}
```

**规则**：
- 用 `@WebMvcTest` 而非 `@SpringBootTest`（轻量）
- 测试：请求校验、响应格式、HTTP 状态码、权限拦截
- 不测业务逻辑（那是 Service 的事）

#### 2.4.4 集成测试

```java
@SpringBootTest(webEnvironment = RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthIntegrationTest extends BaseIntegrationTest {

    @Test
    void should_CompleteAuthFlow() throws Exception {
        // 注册
        String response = register("test@example.com", "Pass123456");
        // 手动验证
        verifyEmail("test@example.com");
        // 登录
        String token = login("test@example.com", "Pass123456");
        // 访问受保护资源
        mvc.perform(get("/api/groups").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk());
    }
}
```

**规则**：
- 继承 `BaseIntegrationTest`（提供 register/login/verifyEmail 工具方法）
- 测试跨层完整流程
- 每个核心业务场景 1 个集成测试

### 2.5 测试数据工厂

```java
public class TestDataFactory {

    public static User user() {
        return user("test@example.com");
    }

    public static User user(String email) {
        User u = new User();
        u.setEmail(email);
        u.setPassword(new BCryptPasswordEncoder().encode("Test123456"));
        u.setNickname("Tester");
        u.setEmailVerified(true);
        return u;
    }

    public static Group group(User creator) {
        Group g = new Group();
        g.setName("Test Group");
        g.setInviteCode(UUID.randomUUID().toString().substring(0, 8));
        g.setCreator(creator);
        return g;
    }

    public static Message message(Group group, User sender, String content) {
        Message m = new Message();
        m.setGroup(group);
        m.setSender(sender);
        m.setContent(content);
        m.setType(MessageType.USER);
        return m;
    }
}
```

### 2.6 覆盖率要求

| 指标 | 目标 |
|------|------|
| 行覆盖率 | >= 70% |
| 分支覆盖率 | >= 60% |
| Service 层 | >= 80% |
| Controller 层 | >= 70% |
| Entity 层 | 100% 映射验证 |

**工具**：JaCoCo

```kotlin
// build.gradle.kts
plugins {
    id("jacoco")
}

tasks.jacocoTestReport {
    reports {
        html.required.set(true)
        xml.required.set(true)
    }
}

tasks.jacocoTestCoverageVerification {
    violationRules {
        rule {
            limit {
                minimum = "0.70".toBigDecimal()
            }
        }
    }
}

tasks.test {
    finalizedBy(tasks.jacocoTestReport)
}
```

**运行**：
```bash
./gradlew test jacocoTestReport
# 报告: server/build/reports/jacoco/test/html/index.html
```

### 2.7 CI 集成

```yaml
# .github/workflows/ci.yml (后端部分)
backend-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-java@v4
      with:
        distribution: 'temurin'
        java-version: '17'
        cache: 'gradle'
    - name: Run tests with coverage
      run: cd server && ./gradlew test jacocoTestReport
    - name: Check coverage threshold
      run: cd server && ./gradlew jacocoTestCoverageVerification
    - name: Upload coverage report
      uses: actions/upload-artifact@v4
      with:
        name: backend-coverage
        path: server/build/reports/jacoco/
```

### 2.8 待建设清单（按优先级）

| 优先级 | 任务 | 预估用例数 |
|--------|------|-----------|
| P0 | 创建 TestDataFactory | - |
| P0 | 创建 BaseIntegrationTest | - |
| P0 | JaCoCo 覆盖率集成 | - |
| P1 | AuthControllerTest | ~8 |
| P1 | GroupControllerTest | ~6 |
| P1 | MessageControllerTest | ~8 |
| P1 | GlobalExceptionHandlerTest | ~6 |
| P2 | SecurityConfigTest | ~5 |
| P2 | GroupServiceTest（补全） | ~6 |
| P2 | WebSocket STOMP 集成测试 | ~4 |
| P2 | MessageIntegrationTest | ~5 |
| P3 | AuthServiceTest 迁移到 MockitoExtension | - |
| P3 | 统一方法命名为 should_X_when_Y | - |

### 2.9 运行命令速查

```bash
# 全部测试
cd server && ./gradlew test

# 指定测试类
./gradlew test --tests "*AIServiceTest*"

# 按层运行
./gradlew test --tests "com.abao.entity.*"
./gradlew test --tests "com.abao.service.*"
./gradlew test --tests "com.abao.integration.*"

# 带覆盖率
./gradlew test jacocoTestReport

# API 脚本测试（需 Docker 环境）
cd server/scripts && ./api_test.sh
```
