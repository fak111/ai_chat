---
版本: v2.0
创建时间: 2026-02-09
最后更新: 2026-02-09
作者: zfc & Claude
---

# Android APK 构建指南

> 从零开始在 macOS (Apple Silicon) 上构建 Flutter Android Release APK 的完整流程与踩坑记录。

## 目录

1. [环境准备](#1-环境准备)
2. [签名密钥配置](#2-签名密钥配置)
3. [Gradle 国内镜像加速](#3-gradle-国内镜像加速)
4. [版本兼容性配置](#4-版本兼容性配置)
5. [ProGuard 配置](#5-proguard-配置)
6. [API 地址配置](#6-api-地址配置)
7. [构建与安装](#7-构建与安装)
8. [踩坑记录](#8-踩坑记录)
9. [文件清单与 Checklist](#9-文件清单与-checklist)

---

## 1. 环境准备

### 1.1 安装 JDK 17

```bash
brew install openjdk@17

# 加到 ~/.zshrc
export JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null || echo "/opt/homebrew/opt/openjdk@17")
export PATH="$JAVA_HOME/bin:$PATH"

# 验证
java -version   # openjdk 17.x.x
```

> `brew install --cask temurin@17` 需要 sudo，`brew install openjdk@17` 不需要。

### 1.2 安装 Android SDK

```bash
brew install --cask android-commandlinetools

yes | sdkmanager --licenses
sdkmanager "platforms;android-36"
sdkmanager "build-tools;36.0.0"
sdkmanager "platform-tools"

flutter doctor -v   # 确认 Android 无报错
```

### 1.3 确认 local.properties

`app/android/local.properties`（Flutter 自动生成）：

```properties
sdk.dir=/Users/zfc/Library/Android/sdk
flutter.sdk=/opt/homebrew/Caskroom/flutter/3.29.2/flutter
```

---

## 2. 签名密钥配置

### 2.1 生成 Keystore

```bash
keytool -genkey -v \
  -keystore ~/abao-release-key.jks \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -alias abao \
  -storepass abao123456 \
  -keypass abao123456 \
  -dname "CN=ABao, OU=Dev, O=ABao, L=Beijing, ST=Beijing, C=CN"
```

> 如果 `keytool` 找不到，可用 VS Code Java 扩展自带的：
> `~/.antigravity/extensions/redhat.java-*/jre/*/bin/keytool`

### 2.2 创建 key.properties

`app/android/key.properties`：

```properties
storePassword=abao123456
keyPassword=abao123456
keyAlias=abao
storeFile=/Users/zfc/abao-release-key.jks
```

> `key.properties` 和 `.jks` 不入 Git。

### 2.3 Gradle 签名配置

`app/android/app/build.gradle` 中已配置好：

```groovy
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"]
                keyPassword = keystoreProperties["keyPassword"]
                storeFile = keystoreProperties["storeFile"] ? file(keystoreProperties["storeFile"]) : null
                storePassword = keystoreProperties["storePassword"]
            }
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.release
            minifyEnabled = true
            shrinkResources = true
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
        }
    }
}
```

---

## 3. Gradle 国内镜像加速

**没有镜像首次构建 280s，配了镜像后 23s。**

### 3.1 settings.gradle

`app/android/settings.gradle` — 阿里云镜像放在 google() 前面：

```groovy
pluginManagement {
    // ...
    repositories {
        maven { url 'https://maven.aliyun.com/repository/google' }
        maven { url 'https://maven.aliyun.com/repository/central' }
        maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
```

### 3.2 build.gradle

`app/android/build.gradle`：

```groovy
allprojects {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/google' }
        maven { url 'https://maven.aliyun.com/repository/central' }
        google()
        mavenCentral()
    }
}
```

---

## 4. 版本兼容性配置

`app/android/settings.gradle`：

```groovy
plugins {
    id "dev.flutter.flutter-plugin-loader" version "1.0.0"
    id "com.android.application" version "8.7.0" apply false    // AGP
    id "org.jetbrains.kotlin.android" version "2.1.0" apply false  // Kotlin
}
```

| 组件 | 原始版本 | 最终版本 | 升级原因 |
|------|----------|----------|----------|
| AGP | 8.1.0 | **8.7.0** | Flutter 3.29 要求 >= 8.1.1 |
| Kotlin | 1.9.0 | **2.1.0** | AGP 8.7.0 要求 >= 2.1.0 |

---

## 5. ProGuard 配置

`app/android/app/proguard-rules.pro`：

```proguard
# Flutter Wrapper
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Keep native methods
-keepclassmembers class * {
    native <methods>;
}

# Google Play Core (not used but referenced by Flutter engine)
-dontwarn com.google.android.play.core.**
```

---

## 6. API 地址配置

`app/lib/services/api_service.dart`：

```dart
// 当前：IP 直连（域名未备案，被火山引擎 Suzaku 拦截）
static const String baseUrl = 'http://118.196.78.215';

// 备案后切回
// static const String baseUrl = 'https://api.swjip.asia';

// 开发环境
// static const String baseUrl = 'http://localhost:8080';
```

WebSocket 地址基于 baseUrl 自动推导（`websocket_service.dart:46`）：
```dart
final wsUrl = Uri.parse('${ApiService.baseUrl.replaceFirst('http', 'ws')}/ws?token=$token');
```

### Android 明文 HTTP 权限

`AndroidManifest.xml` 中已配置 `android:usesCleartextTraffic="true"`，允许 HTTP 明文通信。

> **为什么用 HTTP 不用 HTTPS？** 详见 [ServerDeploy.md 6.1 节](ServerDeploy.md#61-域名未备案被-suzaku-拦截最大坑)

---

## 7. 构建与安装

```bash
cd app

# 构建 Release APK
flutter build apk --release

# 产物：app/build/app/outputs/flutter-apk/app-release.apk (~51.7MB)
```

安装到设备：
```bash
# USB 连接
adb install build/app/outputs/flutter-apk/app-release.apk

# 或 Flutter 命令
flutter install
```

### 测试账号

在服务器上创建的测试账号（已跳过邮箱验证）：

| 邮箱 | 昵称 | 密码 |
|------|------|------|
| `a@t.com` | aaa | `Abc123456` |
| `b@t.com` | bbb | `Abc123456` |
| `c@t.com` | ccc | `Abc123456` |

---

## 8. 踩坑记录

### 8.1 AGP 版本过低

```
FAILURE: Build failed with an exception.
> Could not resolve all files for configuration ':classpath'.
```

**原因**：Flutter 3.29 要求 AGP >= 8.1.1，模板默认 8.1.0
**解决**：`settings.gradle` 中 AGP 升到 `8.7.0`

### 8.2 NDK source.properties 损坏

```
NDK at .../ndk/27.0.12077973 did not have a source.properties file
```

**解决**：`rm -rf ~/Library/Android/sdk/ndk/` 后重新构建

### 8.3 R8 缺少 Play Core 类

```
ERROR: Missing classes detected while running R8.
Missing class com.google.android.play.core.splitcompat.SplitCompatApplication
```

**解决**：`proguard-rules.pro` 加 `-dontwarn com.google.android.play.core.**`

### 8.4 Gradle 依赖下载极慢（280s）

**解决**：配置阿里云镜像（见第 3 节），280s → 23s

### 8.5 JDK 版本不对

**解决**：`brew install openjdk@17`，`JAVA_HOME` 指向 17

### 8.6 APP 注册报"请求失败"

**完整排查链**：

```
APP 报"请求失败"
  → baseUrl 是 https://api.swjip.asia
    → 域名未 ICP 备案
      → 火山引擎 Suzaku 拦截外部域名请求
        → 改用 IP 直连 http://118.196.78.215
          → 端口 8080 在安全组没开
            → 改走 Nginx 80 端口反代
              → ✅ 通了
```

**教训**：大陆服务器 + 未备案域名 = 一定被拦。`curl -v` 看 `Server: Suzaku` 响应头就能确认。

### 8.7 keytool 找不到

**备选路径**：VS Code Java 扩展自带 `~/.antigravity/extensions/redhat.java-*/jre/*/bin/keytool`

---

## 9. 文件清单与 Checklist

### 关键文件

| 文件 | 用途 |
|------|------|
| `app/android/settings.gradle` | AGP/Kotlin 版本 + Gradle 镜像 |
| `app/android/build.gradle` | 项目级仓库镜像 |
| `app/android/app/build.gradle` | 签名配置、混淆开关 |
| `app/android/app/proguard-rules.pro` | R8 混淆规则 |
| `app/android/key.properties` | 签名密钥引用（不入 Git） |
| `~/abao-release-key.jks` | 签名密钥文件（不入 Git） |
| `app/lib/services/api_service.dart` | API baseUrl |
| `app/android/app/src/main/AndroidManifest.xml` | HTTP 明文权限 |

### 构建 Checklist

- [ ] JDK 17 + `JAVA_HOME` 已配
- [ ] Android SDK 已装（`flutter doctor` 无报错）
- [ ] `key.properties` 存在且路径正确
- [ ] `~/abao-release-key.jks` 存在
- [ ] 阿里云镜像已配置
- [ ] `baseUrl` 指向正确环境（当前 `http://118.196.78.215`）
- [ ] `flutter build apk --release`
- [ ] 手机浏览器能打开 `http://118.196.78.215/api/health`（确认网络通）
