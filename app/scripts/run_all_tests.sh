#!/bin/bash
# A宝 Flutter 完整测试脚本
# 用法: ./scripts/run_all_tests.sh

set -e

cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       A宝 Flutter 测试套件                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# 计数器
PASSED=0
FAILED=0

run_test() {
    local name=$1
    local cmd=$2

    echo -e "\n${YELLOW}[TEST]${NC} $name"
    if eval "$cmd" > /tmp/test_output.log 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED++))
        # 显示通过的测试数
        grep -E "^\d+:\d+ \+\d+" /tmp/test_output.log | tail -1 || true
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((FAILED++))
        cat /tmp/test_output.log | head -20
    fi
}

echo -e "${YELLOW}运行 Model 测试 (dart test)${NC}"
echo "=============================="

run_test "User Model" "dart test test/models/user_test.dart"
run_test "Group Model" "dart test test/models/group_test.dart"
run_test "Message Model" "dart test test/models/message_test.dart"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              测试结果汇总                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "通过: ${GREEN}$PASSED${NC}"
echo -e "失败: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过!${NC}"
    exit 0
else
    echo -e "${RED}✗ 有 $FAILED 个测试失败${NC}"
    exit 1
fi
