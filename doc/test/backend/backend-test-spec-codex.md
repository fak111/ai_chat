# 后端测试规范与体系化方案（codex）

> 适用范围：`server/`（Spring Boot 后端）
>
> 文档目标：先沉淀当前项目中已落地的测试规范，再给出“体系化、高基建”的可执行升级方案。

---

## 1. 当前已存在的测试规范（基于仓库现状）

### 1.1 测试技术栈

- 框架：Spring Boot Test + JUnit 5
- 断言：AssertJ + JUnit Assertions
- Mock：Mockito（`@ExtendWith(MockitoExtension.class)`）
- Web 集成：MockMvc
- 测试数据库：H2（`application-test.yml`）

来源文件：

- `server/build.gradle.kts`
- `server/src/test/resources/application-test.yml`

### 1.2 测试目录与分层现状

- `server/src/test/java/com/abao/entity/`：实体与约束测试（`@DataJpaTest`）
- `server/src/test/java/com/abao/service/`：服务层测试（Mockito + Spring 混合）
- `server/src/test/java/com/abao/integration/`：接口集成测试（`@SpringBootTest + MockMvc`）
- `server/src/test/java/com/abao/AbaoApplicationTests.java`：应用上下文冒烟
- `server/scripts/api_test.sh`：面向本地环境的 API 脚本测试

命名规范：`*Test.java`（已遵循）。

### 1.3 当前测试规模（按 `@Test` 统计）

主要文件测试数：

- `service/AIServiceTest.java`：26
- `service/MessageServiceTest.java`：7
- `service/AuthServiceTest.java`：7
- `integration/AuthIntegrationTest.java`：5
- `integration/GroupIntegrationTest.java`：4
- `entity/UserEntityTest.java`：3
- `entity/MessageEntityTest.java`：3
- `entity/GroupEntityTest.java`：2
- `AbaoApplicationTests.java`：1

按分层聚合：

- `service`：40
- `integration`：9
- `entity`：8
- `context smoke`：1

### 1.4 当前执行方式

- 单一主命令：`cd server && ./gradlew test`
- CI 中已接入：
  - JDK 17
  - `./gradlew test`
  - `SPRING_PROFILES_ACTIVE=test`
- 额外脚本：`server/scripts/api_test.sh`
  - 覆盖 health/auth/group/message/AI 场景
  - 依赖本地服务、Docker、`jq`、数据库直连清理

### 1.5 当前已形成的测试设计实践

- 使用 `@ActiveProfiles("test")` 切换测试配置。
- 数据层通过 `@DataJpaTest` 验证实体约束与关联。
- 服务层分两类：
  - 纯 Mockito 单元测试（如 `MessageServiceTest`, `AIServiceTest`）
  - Spring 容器型服务测试（如 `AuthServiceTest`）
- 集成层使用 MockMvc 验证鉴权、HTTP 状态码与响应字段。
- 覆盖了核心业务：注册/登录/刷新令牌、群组创建与加入、消息发送与 AI 上下文构造。

---

## 2. 当前主要缺口（未形成体系的地方）

### 2.1 测试分层边界还不够统一

- `service` 目录内既有纯单测也有容器级测试，策略不统一。
- 缺少明确的“什么用 Mockito、什么用 Spring Context”的标准。

### 2.2 测试环境策略割裂

- JUnit 主链路以 H2 为主。
- `api_test.sh` 依赖真实运行环境（Docker + Postgres + Redis + 脚本改库）。
- 两条链路均有价值，但尚未形成“PR 快速回归 / 夜间真实环境回归”的体系化编排。

### 2.3 覆盖率与质量门禁不足

- CI 已跑测试，但未设置覆盖率阈值（JaCoCo）。
- 未建立失败类型分类（单测失败、集成失败、环境失败）和质量红线。

### 2.4 测试数据治理不足

- 多处用 `System.currentTimeMillis()` 生成邮箱，虽可规避冲突，但可读性与可追溯性一般。
- 缺少统一测试数据工厂（fixture/builder），重复构造对象较多。

### 2.5 脚本测试工程化不足

- `api_test.sh` 功能丰富，但属于“脚本集成测试”，未纳入统一测试报告体系。
- 对依赖前置（服务状态、DB 清理权限）要求较高，CI 难以直接复用。

---

## 3. 后端未来“体系化高基建”测试规范（目标方案）

### 3.1 统一测试分层标准（强制）

- **L1 单元测试（快）**
  - 目标：纯业务逻辑、分支、异常路径。
  - 工具：JUnit5 + Mockito。
  - 约束：不启 Spring 容器，不连数据库。
- **L2 切片测试（准）**
  - 目标：Repository/JPA、Controller Web 层契约。
  - 工具：`@DataJpaTest`、`@WebMvcTest`（建议补齐）。
- **L3 集成测试（全）**
  - 目标：鉴权链路、事务、序列化、数据库交互。
  - 工具：`@SpringBootTest + MockMvc`。
- **L4 真实环境 API 回归（稳）**
  - 目标：部署前/夜间验证与脚本冒烟。
  - 工具：`api_test.sh` 或后续迁移到 Testcontainers + API 测试框架。

### 3.2 测试数据与夹具规范

- 建立统一测试工厂：`TestDataFactory`、`UserBuilder`、`GroupBuilder`、`MessageBuilder`。
- 禁止在各文件散落重复构造逻辑（除非极简场景）。
- 统一常量：测试密码、默认昵称、token 前缀、时间窗口。
- 时间相关逻辑支持可注入 `Clock`（减少时间漂移导致的不稳定断言）。

### 3.3 数据库与环境规范

- PR 主链路：默认 H2（快反馈）。
- 每日/每周回归：Postgres + Redis 真环境链路（建议 Testcontainers）。
- 对 SQL 方言敏感模块（JSONB、索引、分页）必须至少有一组 Postgres 验证用例。

### 3.4 覆盖率与质量门禁

- 接入 JaCoCo 并在 CI 强制阈值（分阶段）：
  - 阶段 A：line >= 65%
  - 阶段 B：line >= 75%，核心包（`service`, `controller`, `security`）>= 80%
- 对关键服务设最小方法覆盖要求（Auth/Message/AI）。
- 禁止合并：新增业务代码无测试、关键路径仅 happy-path 无异常分支。

### 3.5 测试命名与断言规范

- 用例命名推荐：`method_condition_expectedResult`（已基本符合）。
- 每个用例至少包含一个“业务意义断言”，避免仅断言非空。
- 异常路径必须校验：异常类型 + 关键 message/status。

### 3.6 CI 编排规范（建议）

- `backend-test-fast`（PR 必跑）：L1 + L2 + 轻量 L3
- `backend-test-full`（夜间/主干）：全量 L3 + L4
- 产物统一上传：
  - JUnit XML
  - JaCoCo HTML/XML
  - API 回归日志

---

## 4. 后端落地路线图（建议）

### M1（1 周）：规范固化

- 在 `server/` 增加测试分层说明文档（README 或 CONTRIBUTING 段落）。
- 梳理现有测试，标记 L1/L2/L3。
- 统一命令入口（Gradle task 或脚本封装）。

### M2（1~2 周）：基础设施补齐

- 引入 JaCoCo 并接入 CI。
- 建立 `TestDataFactory` 与通用 builder。
- 新增 `@WebMvcTest` 控制器切片测试（补齐当前空白层）。

### M3（2 周）：真实环境回归体系化

- 将 `api_test.sh` 纳入夜间流水线（或迁移为结构化 API tests）。
- 增加 Postgres 特性用例（避免 H2 假阳性）。
- 输出“失败分类 + 排障手册”。

### M4（持续）：稳定性与成本优化

- 慢测拆分并行执行。
- 对波动用例做根因治理（时间、并发、外部依赖）。
- 构建趋势看板（通过率、时长、覆盖率）。

---

## 5. 后端“Definition of Done（测试维度）”建议

- 每个业务改动至少新增或更新 1 个 L1/L2/L3 用例。
- 涉及鉴权、数据一致性、AI 触发规则的改动必须覆盖异常分支。
- PR 必附：执行命令、结果摘要、风险说明。
- 如引入新配置/环境变量，必须补充测试配置与回归说明。

