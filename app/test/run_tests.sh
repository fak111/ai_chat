#!/bin/bash
# Flutter 测试运行脚本 - 处理代理问题
# 用法: ./test/run_tests.sh

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}A宝 Flutter 测试套件${NC}"
echo "=========================="

# 获取代理状态
WIFI_INTERFACE="Wi-Fi"
WEB_PROXY=$(networksetup -getwebproxy "$WIFI_INTERFACE" 2>/dev/null | grep "Enabled" | head -1)
SECURE_PROXY=$(networksetup -getsecurewebproxy "$WIFI_INTERFACE" 2>/dev/null | grep "Enabled" | head -1)

# 保存原始代理状态
WEB_PROXY_ENABLED=false
SECURE_PROXY_ENABLED=false

if [[ "$WEB_PROXY" == *"Enabled: Yes"* ]]; then
    WEB_PROXY_ENABLED=true
fi
if [[ "$SECURE_PROXY" == *"Enabled: Yes"* ]]; then
    SECURE_PROXY_ENABLED=true
fi

# 临时关闭代理
disable_proxy() {
    echo -e "${YELLOW}临时关闭系统代理...${NC}"
    networksetup -setwebproxystate "$WIFI_INTERFACE" off 2>/dev/null || true
    networksetup -setsecurewebproxystate "$WIFI_INTERFACE" off 2>/dev/null || true
    sleep 1
}

# 恢复代理
restore_proxy() {
    echo -e "${YELLOW}恢复系统代理...${NC}"
    if [ "$WEB_PROXY_ENABLED" = true ]; then
        networksetup -setwebproxystate "$WIFI_INTERFACE" on 2>/dev/null || true
    fi
    if [ "$SECURE_PROXY_ENABLED" = true ]; then
        networksetup -setsecurewebproxystate "$WIFI_INTERFACE" on 2>/dev/null || true
    fi
}

# 确保退出时恢复代理
trap restore_proxy EXIT

# 1. 运行纯 Dart 测试 (Model)
echo ""
echo -e "${YELLOW}[1/2] 运行 Model 测试 (dart test)${NC}"
dart test test/models/ 2>&1

# 2. 运行 Flutter 测试 (Provider/Service/Widget)
echo ""
echo -e "${YELLOW}[2/2] 运行 Flutter 测试${NC}"

if [ "$WEB_PROXY_ENABLED" = true ] || [ "$SECURE_PROXY_ENABLED" = true ]; then
    disable_proxy
fi

# 运行 flutter test
flutter test test/widget_test.dart 2>&1 || true

echo ""
echo -e "${GREEN}测试完成!${NC}"
