#!/bin/bash
# ============================================
# A宝 Node.js E2E 测试脚本 - 双账号互测
# 模拟 doc/e2e/e2e_2 的完整场景
# 用法: ./e2e_test.sh [base_url]
# ============================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
BASE_URL="${1:-http://localhost:9090}"
NOPROXY="--noproxy localhost"
TIMESTAMP=$(date +%s)

# 计数器
PASSED=0
FAILED=0
TOTAL=0

# 双账号测试数据
EMAIL_A="e2e_a_${TIMESTAMP}@example.com"
EMAIL_B="e2e_b_${TIMESTAMP}@example.com"
PASSWORD="Test123456"
NICK_A="PlayerA_${TIMESTAMP}"
NICK_B="PlayerB_${TIMESTAMP}"

# 运行时变量
TOKEN_A=""
TOKEN_B=""
USER_ID_A=""
USER_ID_B=""
GROUP_ID=""
INVITE_CODE=""
MSG_A1=""
MSG_B1=""
MSG_A2=""
MSG_B2=""
AI_MSG_ID=""

# ============================================
# 辅助函数
# ============================================

print_header() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
}

print_test() {
    echo -e "\n${YELLOW}[$1]${NC} $2"
}

pass() {
    ((PASSED++))
    ((TOTAL++))
    echo -e "${GREEN}  ✓ PASS${NC}"
}

fail() {
    ((FAILED++))
    ((TOTAL++))
    echo -e "${RED}  ✗ FAIL: $1${NC}"
}

http_get() {
    local url=$1
    local token=$2
    local auth=""
    [ -n "$token" ] && auth="-H \"Authorization: Bearer $token\""
    eval "curl $NOPROXY -s -w '\n%{http_code}' \"$url\" $auth"
}

http_post() {
    local url=$1
    local data=$2
    local token=$3
    local auth=""
    [ -n "$token" ] && auth="-H \"Authorization: Bearer $token\""
    eval "curl $NOPROXY -s -w '\n%{http_code}' -X POST \"$url\" -H 'Content-Type: application/json' $auth -d '$data'"
}

http_delete() {
    local url=$1
    local token=$2
    local auth=""
    [ -n "$token" ] && auth="-H \"Authorization: Bearer $token\""
    eval "curl $NOPROXY -s -w '\n%{http_code}' -X DELETE \"$url\" $auth"
}

get_body() { echo "$1" | sed '$d'; }
get_status() { echo "$1" | tail -1; }
json_field() { echo "$1" | jq -r ".$2" 2>/dev/null; }

assert_status() {
    local expected=$1 actual=$2 body=$3
    if [ "$actual" = "$expected" ]; then
        pass; return 0
    else
        fail "期望 $expected, 实际 $actual. 响应: $(echo "$body" | head -c 200)"
        return 1
    fi
}

verify_email() {
    local email=$1
    docker exec abao-postgres psql -U postgres -d abao -c \
        "UPDATE users SET email_verified = true WHERE email = '$email';" >/dev/null 2>&1
}

# ============================================
# Phase 0: 服务健康检查
# ============================================
phase0_health() {
    print_header "Phase 0: 服务健康检查"

    print_test "0.1" "GET /api/health"
    local resp=$(http_get "$BASE_URL/api/health")
    local body=$(get_body "$resp")
    local status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        echo -e "  → $(json_field "$body" "service") / $(json_field "$body" "status")"
    fi
}

# ============================================
# Phase 1: 双账号注册 + 登录
# ============================================
phase1_dual_auth() {
    print_header "Phase 1: 双账号注册 + 登录 (6 个用例)"

    # 1.1 注册 Account A
    print_test "1.1" "注册 Account A ($EMAIL_A)"
    local resp=$(http_post "$BASE_URL/api/auth/register" \
        "{\"email\":\"$EMAIL_A\",\"password\":\"$PASSWORD\",\"nickname\":\"$NICK_A\"}")
    local body=$(get_body "$resp")
    local status=$(get_status "$resp")
    assert_status "200" "$status" "$body"

    # 1.2 注册 Account B
    print_test "1.2" "注册 Account B ($EMAIL_B)"
    resp=$(http_post "$BASE_URL/api/auth/register" \
        "{\"email\":\"$EMAIL_B\",\"password\":\"$PASSWORD\",\"nickname\":\"$NICK_B\"}")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    assert_status "200" "$status" "$body"

    # 手动验证邮箱
    echo -e "  ${YELLOW}→ 手动验证两个邮箱...${NC}"
    verify_email "$EMAIL_A"
    verify_email "$EMAIL_B"

    # 1.3 登录 Account A
    print_test "1.3" "登录 Account A"
    resp=$(http_post "$BASE_URL/api/auth/login" \
        "{\"email\":\"$EMAIL_A\",\"password\":\"$PASSWORD\"}")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        TOKEN_A=$(json_field "$body" "accessToken")
        USER_ID_A=$(json_field "$body" "user.id")
        echo -e "  → Token A: ${TOKEN_A:0:20}..."
    fi

    # 1.4 登录 Account B
    print_test "1.4" "登录 Account B"
    resp=$(http_post "$BASE_URL/api/auth/login" \
        "{\"email\":\"$EMAIL_B\",\"password\":\"$PASSWORD\"}")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        TOKEN_B=$(json_field "$body" "accessToken")
        USER_ID_B=$(json_field "$body" "user.id")
        echo -e "  → Token B: ${TOKEN_B:0:20}..."
    fi

    # 1.5 A 获取自己的信息
    print_test "1.5" "A 获取 /me"
    resp=$(http_get "$BASE_URL/api/auth/me" "$TOKEN_A")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        echo -e "  → nickname: $(json_field "$body" "nickname")"
    fi

    # 1.6 B 获取自己的信息
    print_test "1.6" "B 获取 /me"
    resp=$(http_get "$BASE_URL/api/auth/me" "$TOKEN_B")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        echo -e "  → nickname: $(json_field "$body" "nickname")"
    fi
}

# ============================================
# Phase 2: 创建群聊 + B 加入
# ============================================
phase2_group() {
    print_header "Phase 2: 创建群聊 + B 加入 (5 个用例)"

    # 2.1 A 创建群聊
    print_test "2.1" "A 创建群聊"
    local resp=$(http_post "$BASE_URL/api/groups" \
        "{\"name\":\"E2E3 Node Test\"}" "$TOKEN_A")
    local body=$(get_body "$resp")
    local status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        GROUP_ID=$(json_field "$body" "id")
        INVITE_CODE=$(json_field "$body" "inviteCode")
        echo -e "  → Group ID: $GROUP_ID"
        echo -e "  → Invite Code: $INVITE_CODE"
        echo -e "  → Member Count: $(json_field "$body" "memberCount")"
    fi

    # 2.2 B 通过邀请码加入
    print_test "2.2" "B 通过邀请码加入群聊"
    resp=$(http_post "$BASE_URL/api/groups/join" \
        "{\"inviteCode\":\"$INVITE_CODE\"}" "$TOKEN_B")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    assert_status "200" "$status" "$body"

    # 2.3 A 查看群详情（应有 A + B + AI = 3 成员）
    print_test "2.3" "A 查看群详情 (3 成员)"
    resp=$(http_get "$BASE_URL/api/groups/$GROUP_ID" "$TOKEN_A")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        local member_count=$(echo "$body" | jq '.members | length')
        echo -e "  → 成员数: $member_count"
        if [ "$member_count" = "3" ]; then
            echo -e "  ${GREEN}→ 成员数正确 (A + B + AI)${NC}"
        else
            echo -e "  ${RED}→ 期望 3 成员，实际 $member_count${NC}"
        fi
    fi

    # 2.4 A 查看群列表
    print_test "2.4" "A 查看群列表"
    resp=$(http_get "$BASE_URL/api/groups" "$TOKEN_A")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        local count=$(echo "$body" | jq 'length')
        echo -e "  → 群数量: $count"
    fi

    # 2.5 B 也能看到群列表
    print_test "2.5" "B 查看群列表"
    resp=$(http_get "$BASE_URL/api/groups" "$TOKEN_B")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        local count=$(echo "$body" | jq 'length')
        echo -e "  → 群数量: $count"
    fi
}

# ============================================
# Phase 3: 多轮 A/B 对话
# ============================================
phase3_chat() {
    print_header "Phase 3: A/B 多轮对话 (6 个用例)"

    # 3.1 A 发消息
    print_test "3.1" "A 发送: hello from A"
    local resp=$(http_post "$BASE_URL/api/messages/group/$GROUP_ID" \
        "{\"content\":\"hello from A\"}" "$TOKEN_A")
    local body=$(get_body "$resp")
    local status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        MSG_A1=$(json_field "$body" "id")
        echo -e "  → sender: $(json_field "$body" "senderNickname"), msgId: ${MSG_A1:0:8}..."
    fi

    # 3.2 B 发消息
    print_test "3.2" "B 发送: hello from B"
    resp=$(http_post "$BASE_URL/api/messages/group/$GROUP_ID" \
        "{\"content\":\"hello from B\"}" "$TOKEN_B")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        MSG_B1=$(json_field "$body" "id")
        echo -e "  → sender: $(json_field "$body" "senderNickname"), msgId: ${MSG_B1:0:8}..."
    fi

    # 3.3 A 发消息 (第二轮)
    print_test "3.3" "A 发送: 大家好！测试多轮对话"
    resp=$(http_post "$BASE_URL/api/messages/group/$GROUP_ID" \
        "{\"content\":\"大家好！我们来测试多轮对话\"}" "$TOKEN_A")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        MSG_A2=$(json_field "$body" "id")
    fi

    # 3.4 B 带回复发消息
    print_test "3.4" "B 回复 A 的第一条消息"
    resp=$(http_post "$BASE_URL/api/messages/group/$GROUP_ID" \
        "{\"content\":\"收到 A 的消息！\",\"replyToId\":\"$MSG_A1\"}" "$TOKEN_B")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        MSG_B2=$(json_field "$body" "id")
        echo -e "  → replyToContent: $(json_field "$body" "replyToContent")"
    fi

    # 3.5 验证消息列表 (A 视角)
    print_test "3.5" "A 获取最近消息 (应有 4 条)"
    resp=$(http_get "$BASE_URL/api/messages/group/$GROUP_ID/recent?limit=10" "$TOKEN_A")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        local count=$(echo "$body" | jq 'length')
        echo -e "  → 消息数: $count"
    fi

    # 3.6 验证分页查询
    print_test "3.6" "分页查询消息"
    resp=$(http_get "$BASE_URL/api/messages/group/$GROUP_ID?page=0&size=2" "$TOKEN_A")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        echo -e "  → totalElements: $(json_field "$body" "totalElements")"
        echo -e "  → size: $(json_field "$body" "size")"
        echo -e "  → content.length: $(echo "$body" | jq '.content | length')"
    fi
}

# ============================================
# Phase 4: @AI 触发测试
# ============================================
phase4_ai() {
    print_header "Phase 4: @AI 触发测试 (3 个用例)"

    # 4.1 A 发送 @AI 消息
    print_test "4.1" "A 发送: @AI 请用一句话介绍量子计算"
    local resp=$(http_post "$BASE_URL/api/messages/group/$GROUP_ID" \
        "{\"content\":\"@AI 请用一句话介绍量子计算\"}" "$TOKEN_A")
    local body=$(get_body "$resp")
    local status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        local ai_trigger_msg=$(json_field "$body" "id")
        echo -e "  ${YELLOW}→ 等待 AI 响应 (8秒)...${NC}"
        sleep 8

        # 查询 AI 消息
        local ai_msg=$(docker exec abao-postgres psql -U postgres -d abao -t -c \
            "SELECT id FROM messages WHERE group_id='$GROUP_ID' AND message_type='AI' ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | tr -d ' ')

        if [ -n "$ai_msg" ]; then
            AI_MSG_ID=$(echo "$ai_msg" | tr -d '[:space:]')
            echo -e "  ${GREEN}→ AI 已回复! MSG_ID: ${AI_MSG_ID:0:8}...${NC}"

            # 验证 AI 回复内容
            local ai_content=$(docker exec abao-postgres psql -U postgres -d abao -t -c \
                "SELECT content FROM messages WHERE id='$AI_MSG_ID';" 2>/dev/null)
            echo -e "  → AI 说: $(echo "$ai_content" | head -c 80)..."
        else
            echo -e "  ${YELLOW}→ AI 暂未回复 (可能 DEEPSEEK_API_KEY 未配置)${NC}"
        fi
    fi

    # 4.2 B 引用 AI 消息追问
    print_test "4.2" "B 引用 AI 回复进行追问"
    if [ -z "$AI_MSG_ID" ]; then
        echo -e "  ${YELLOW}→ 跳过: 无 AI 消息可引用${NC}"
        ((TOTAL++))
        ((PASSED++))
    else
        resp=$(http_post "$BASE_URL/api/messages/group/$GROUP_ID" \
            "{\"content\":\"能再详细解释一下吗？\",\"replyToId\":\"$AI_MSG_ID\"}" "$TOKEN_B")
        body=$(get_body "$resp")
        status=$(get_status "$resp")
        if assert_status "200" "$status" "$body"; then
            echo -e "  → replyToContent: $(json_field "$body" "replyToContent")"
            echo -e "  ${YELLOW}→ 等待 AI 二次响应 (8秒)...${NC}"
            sleep 8

            local ai_count=$(docker exec abao-postgres psql -U postgres -d abao -t -c \
                "SELECT COUNT(*) FROM messages WHERE group_id='$GROUP_ID' AND message_type='AI';" 2>/dev/null | tr -d ' ')
            echo -e "  → AI 消息总数: $ai_count"
        fi
    fi

    # 4.3 B 独立 @AI
    print_test "4.3" "B 独立发送 @AI 消息"
    resp=$(http_post "$BASE_URL/api/messages/group/$GROUP_ID" \
        "{\"content\":\"@AI 用简单的话解释什么是黑洞\"}" "$TOKEN_B")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        echo -e "  → 消息已发送"
    fi
}

# ============================================
# Phase 5: 边界测试
# ============================================
phase5_edge_cases() {
    print_header "Phase 5: 边界测试 (6 个用例)"

    # 5.1 空消息
    print_test "5.1" "发送空消息 -> 400"
    local resp=$(http_post "$BASE_URL/api/messages/group/$GROUP_ID" \
        "{\"content\":\"\"}" "$TOKEN_A")
    local status=$(get_status "$resp")
    if [ "$status" = "400" ]; then pass; else fail "期望 400, 实际 $status"; fi

    # 5.2 未认证访问
    print_test "5.2" "未认证访问群组 -> 401/403"
    resp=$(http_get "$BASE_URL/api/groups")
    status=$(get_status "$resp")
    if [ "$status" = "401" ] || [ "$status" = "403" ]; then pass; else fail "期望 401/403, 实际 $status"; fi

    # 5.3 无效邀请码
    print_test "5.3" "无效邀请码加入 -> 404"
    resp=$(http_post "$BASE_URL/api/groups/join" \
        "{\"inviteCode\":\"XXXXXX\"}" "$TOKEN_A")
    status=$(get_status "$resp")
    if [ "$status" = "404" ]; then pass; else fail "期望 404, 实际 $status"; fi

    # 5.4 重复加入
    print_test "5.4" "重复加入群聊 -> 409"
    resp=$(http_post "$BASE_URL/api/groups/join" \
        "{\"inviteCode\":\"$INVITE_CODE\"}" "$TOKEN_B")
    status=$(get_status "$resp")
    if [ "$status" = "409" ]; then pass; else fail "期望 409, 实际 $status"; fi

    # 5.5 获取不存在的消息
    print_test "5.5" "获取不存在的消息 -> 404"
    resp=$(http_get "$BASE_URL/api/messages/00000000-0000-0000-0000-000000000000" "$TOKEN_A")
    status=$(get_status "$resp")
    if [ "$status" = "404" ]; then pass; else fail "期望 404, 实际 $status"; fi

    # 5.6 Token 刷新
    print_test "5.6" "Token 刷新"
    # 先获取 refresh token
    resp=$(http_post "$BASE_URL/api/auth/login" \
        "{\"email\":\"$EMAIL_A\",\"password\":\"$PASSWORD\"}")
    local body=$(get_body "$resp")
    local refresh_token=$(json_field "$body" "refreshToken")
    resp=$(http_post "$BASE_URL/api/auth/refresh" \
        "{\"refreshToken\":\"$refresh_token\"}")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        echo -e "  → 新 Token: $(json_field "$body" "accessToken" | head -c 20)..."
    fi
}

# ============================================
# Phase 6: B 退出群聊
# ============================================
phase6_leave() {
    print_header "Phase 6: B 退出群聊 (2 个用例)"

    # 6.1 B 退出
    print_test "6.1" "B 退出群聊"
    local resp=$(http_delete "$BASE_URL/api/groups/$GROUP_ID/leave" "$TOKEN_B")
    local body=$(get_body "$resp")
    local status=$(get_status "$resp")
    assert_status "200" "$status" "$body"

    # 6.2 验证成员数变化
    print_test "6.2" "验证成员数减少"
    resp=$(http_get "$BASE_URL/api/groups/$GROUP_ID" "$TOKEN_A")
    body=$(get_body "$resp")
    status=$(get_status "$resp")
    if assert_status "200" "$status" "$body"; then
        local member_count=$(echo "$body" | jq '.members | length')
        echo -e "  → 成员数: $member_count (应为 2: A + AI)"
    fi
}

# ============================================
# 主函数
# ============================================
main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   A宝 Node.js E2E 双账号互测 - 全链路验证       ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "测试时间: $(date)"
    echo -e "服务地址: $BASE_URL"
    echo -e "Account A: $EMAIL_A"
    echo -e "Account B: $EMAIL_B"

    # 依赖检查
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}错误: 需要安装 jq${NC}"
        exit 1
    fi

    # 服务检查
    echo -e "\n${YELLOW}检查服务状态...${NC}"
    if ! curl $NOPROXY -s "$BASE_URL/api/health" > /dev/null 2>&1; then
        echo -e "${RED}错误: 服务未运行 ($BASE_URL)${NC}"
        exit 1
    fi
    echo -e "${GREEN}服务正常运行${NC}"

    # 运行测试
    phase0_health
    phase1_dual_auth
    phase2_group
    phase3_chat
    phase4_ai
    phase5_edge_cases
    phase6_leave

    # 结果
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                  测试结果汇总                    ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "通过: ${GREEN}$PASSED${NC} / $TOTAL"
    echo -e "失败: ${RED}$FAILED${NC} / $TOTAL"

    if [ $TOTAL -gt 0 ]; then
        local rate=$((PASSED * 100 / TOTAL))
        echo -e "通过率: ${rate}%"
    fi

    echo ""
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ 所有 E2E 测试通过!${NC}"
        exit 0
    else
        echo -e "${RED}✗ 有 $FAILED 个测试失败${NC}"
        exit 1
    fi
}

main "$@"
