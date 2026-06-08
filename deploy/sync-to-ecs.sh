#!/usr/bin/env bash
set -euo pipefail

# ============================================
# GitMemo 国内站部署脚本 — 本地构建 + 同步到 ECS
#
# 用法:
#   ./deploy/sync-to-ecs.sh                    # 构建并部署
#   ./deploy/sync-to-ecs.sh --skip-build       # 跳过构建，仅同步
#   ./deploy/sync-to-ecs.sh --nginx-only       # 仅同步 Nginx 配置
#
# 环境变量:
#   ECS_IP    — ECS 公网 IP（默认 101.200.217.80）
#   ECS_USER  — SSH 用户名（默认 root）
#   ECS_DIR   — ECS 上项目目录（默认 /opt/kakacut）
#   BAIDU_VERIFY_CODE — 百度站长平台验证码（可选，从 ziyuan.baidu.com 获取）
#   VITE_DOWNLOAD_MANIFEST_URL — OSS downloads.json 地址（可选，配置后下载区优先走 OSS）
#   VITE_WEBSITE_ASSET_BASE_URL — 官网大图等静态资源域名（可选，配置后从 OSS/CDN 加载）
#   ANDROID_APK — Android APK 源文件路径（可选，默认自动查找 arm64-v8a release 包）
#   WINDOWS_EXE — Windows x64 installer 源文件路径（可选，默认查找 release-assets/windows）
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEBSITE_DIR="$PROJECT_DIR/website"
PROJECT_VERSION="$(awk -F'"' '/^version = / { print $2; exit }' "$PROJECT_DIR/Cargo.toml")"

# 加载本地配置
if [ -f "$SCRIPT_DIR/.env.local" ]; then
    source "$SCRIPT_DIR/.env.local"
fi

ANDROID_ABI="${ANDROID_ABI:-arm64-v8a}"
ANDROID_VERSION="${ANDROID_VERSION:-v${PROJECT_VERSION}}"
ANDROID_APK_FILENAME="${ANDROID_APK_FILENAME:-gitmemo-android-${ANDROID_VERSION}-${ANDROID_ABI}-release.apk}"
ANDROID_STABLE_APK_FILENAME="${ANDROID_STABLE_APK_FILENAME:-gitmemo-android-${ANDROID_ABI}-release.apk}"
WINDOWS_VERSION="${WINDOWS_VERSION:-v${PROJECT_VERSION}}"
WINDOWS_EXE_FILENAME="${WINDOWS_EXE_FILENAME:-gitmemo-windows-${WINDOWS_VERSION}-x64-setup.exe}"
WINDOWS_STABLE_EXE_FILENAME="${WINDOWS_STABLE_EXE_FILENAME:-gitmemo-windows-x64-setup.exe}"
ECS_IP="${ECS_IP:-101.200.217.80}"
ECS_USER="${ECS_USER:-root}"
ECS_DIR="${ECS_DIR:-/opt/kakacut}"
SKIP_BUILD=false
NGINX_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --skip-build) SKIP_BUILD=true ;;
        --nginx-only) NGINX_ONLY=true ;;
    esac
done

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
log()  { echo -e "${GREEN}[gitmemo-deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC} $*"; }

ECS_SSH="$ECS_USER@$ECS_IP"

apk_abi_list() {
    local apk="$1"
    if ! command -v unzip >/dev/null 2>&1; then
        return 1
    fi
    unzip -Z1 "$apk" 2>/dev/null \
        | awk -F/ '$1 == "lib" && $2 != "" && $NF ~ /\.so$/ { print $2 }' \
        | sort -u \
        | paste -sd ',' -
}

find_aapt() {
    local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
    find "$sdk/build-tools" -type f -name aapt 2>/dev/null | sort | tail -n 1
}

apk_version_name() {
    local apk="$1"
    local aapt_bin
    aapt_bin="$(find_aapt)"
    if [ -z "$aapt_bin" ]; then
        return 1
    fi
    "$aapt_bin" dump badging "$apk" 2>/dev/null \
        | sed -n "s/.*versionName='\([^']*\)'.*/\1/p" \
        | head -n 1
}

apk_matches_published_metadata() {
    local apk="$1"
    local abis
    local version_name
    if [ ! -f "$apk" ]; then
        return 1
    fi
    abis="$(apk_abi_list "$apk" || true)"
    if [ "$abis" != "$ANDROID_ABI" ]; then
        warn "跳过 Android APK：$(basename "$apk") ABI 是 ${abis:-unknown}，不是 ${ANDROID_ABI}" >&2
        return 1
    fi

    version_name="$(apk_version_name "$apk" || true)"
    if [ "$version_name" != "${ANDROID_VERSION#v}" ]; then
        warn "跳过 Android APK：$(basename "$apk") 内部版本是 ${version_name:-unknown}，不是 ${ANDROID_VERSION#v}" >&2
        return 1
    fi

    return 0
}

resolve_android_apk() {
    local candidates=()

    if [ -n "${ANDROID_APK:-}" ]; then
        candidates+=("$ANDROID_APK")
    fi

    candidates+=(
        "$PROJECT_DIR/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/release/$ANDROID_APK_FILENAME"
        "$PROJECT_DIR/desktop/src-tauri/gen/android/app/build/outputs/apk/arm64/release/$ANDROID_APK_FILENAME"
        "$PROJECT_DIR/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/release/gitmemo-android-${ANDROID_ABI}-release.apk"
        "$PROJECT_DIR/desktop/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk"
        "$PROJECT_DIR/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
        "$HOME/Downloads/app-universal-release.apk"
    )

    local candidate
    for candidate in "${candidates[@]}"; do
        if [ ! -f "$candidate" ]; then
            continue
        fi

        if apk_matches_published_metadata "$candidate"; then
            echo "$candidate"
            return 0
        fi
    done

    return 1
}

resolve_windows_exe() {
    local candidates=()

    if [ -n "${WINDOWS_EXE:-}" ]; then
        candidates+=("$WINDOWS_EXE")
    fi

    candidates+=(
        "$PROJECT_DIR/release-assets/windows/GitMemo_${PROJECT_VERSION}_x64-setup.exe"
        "$PROJECT_DIR/release-assets/windows/GitMemo_${WINDOWS_VERSION#v}_x64-setup.exe"
        "$PROJECT_DIR/release-assets/windows/$WINDOWS_EXE_FILENAME"
        "$PROJECT_DIR/release-assets/windows/$WINDOWS_STABLE_EXE_FILENAME"
        "$HOME/Downloads/GitMemo_${PROJECT_VERSION}_x64-setup.exe"
    )

    local candidate
    for candidate in "${candidates[@]}"; do
        if [ -f "$candidate" ]; then
            echo "$candidate"
            return 0
        fi
    done

    return 1
}

# ============================================
# 替换 Google Fonts 为国内镜像
# ============================================
fix_for_china() {
    log "国内站适配：字体 CDN + SEO 元数据..."
    local dist_index="$SCRIPT_DIR/dist/gitmemo/index.html"
    if [ -f "$dist_index" ]; then
        # 替换 fonts.googleapis.com → fonts.googleapis.cn (Google 中国镜像)
        # 替换 fonts.gstatic.com → fonts.gstatic.cn
        # 替换 canonical / og:url 为国内站域名
        sed -i '' \
            -e 's|https://fonts.googleapis.com|https://fonts.googleapis.cn|g' \
            -e 's|https://fonts.gstatic.com|https://fonts.gstatic.cn|g' \
            -e 's|https://gitmemo.dev|https://gitmemo.kakacut.cn|g' \
            "$dist_index"

        # 注入百度站长验证标签（如已配置）
        if [ -n "${BAIDU_VERIFY_CODE:-}" ]; then
            sed -i '' \
                "s|<meta charset=\"UTF-8\" />|<meta charset=\"UTF-8\" />\n    <meta name=\"baidu-site-verification\" content=\"${BAIDU_VERIFY_CODE}\" />|" \
                "$dist_index"
            log "百度验证标签已注入: ${BAIDU_VERIFY_CODE}"
        else
            warn "未设置 BAIDU_VERIFY_CODE 环境变量，跳过百度验证标签注入"
        fi

        log "国内站适配完成"
    else
        warn "未找到 dist/index.html，跳过国内站适配"
    fi
}

# ============================================
# 构建
# ============================================
build_website() {
    log "========== 构建 GitMemo 官网（默认中文）=========="
    cd "$WEBSITE_DIR"
    if [ -n "${VITE_DOWNLOAD_MANIFEST_URL:-}" ]; then
        info "下载 manifest: ${VITE_DOWNLOAD_MANIFEST_URL}"
    else
        warn "未设置 VITE_DOWNLOAD_MANIFEST_URL，下载区将回退 GitHub Releases"
    fi
    if [ -n "${VITE_WEBSITE_ASSET_BASE_URL:-}" ]; then
        info "官网静态资源: ${VITE_WEBSITE_ASSET_BASE_URL}"
    else
        warn "未设置 VITE_WEBSITE_ASSET_BASE_URL，官网大图将使用站内 fallback 资源"
    fi
    VITE_DEFAULT_LANG=zh VITE_SITE_URL=https://gitmemo.kakacut.cn VITE_DOWNLOAD_MANIFEST_URL="${VITE_DOWNLOAD_MANIFEST_URL:-}" VITE_WEBSITE_ASSET_BASE_URL="${VITE_WEBSITE_ASSET_BASE_URL:-}" VITE_ANDROID_APK_VERSION="$ANDROID_VERSION" VITE_ANDROID_APK_FILENAME="$ANDROID_APK_FILENAME" VITE_WINDOWS_DESKTOP_VERSION="$WINDOWS_VERSION" npm run build
    cd "$PROJECT_DIR"

    rm -rf "$SCRIPT_DIR/dist/gitmemo"
    mkdir -p "$SCRIPT_DIR/dist"
    cp -r "$WEBSITE_DIR/dist/client" "$SCRIPT_DIR/dist/gitmemo"

    local resolved_android_apk
    resolved_android_apk="$(resolve_android_apk || true)"
    if [ -n "$resolved_android_apk" ]; then
        mkdir -p "$SCRIPT_DIR/dist/gitmemo/mobile"
        cp "$resolved_android_apk" "$SCRIPT_DIR/dist/gitmemo/mobile/$ANDROID_APK_FILENAME"
        cp "$resolved_android_apk" "$SCRIPT_DIR/dist/gitmemo/mobile/$ANDROID_STABLE_APK_FILENAME"
        log "Android ${ANDROID_ABI} APK 已复制到 /mobile/${ANDROID_APK_FILENAME}"
        log "Android ${ANDROID_ABI} 稳定下载别名已复制到 /mobile/${ANDROID_STABLE_APK_FILENAME}"
        info "APK 源文件: $resolved_android_apk"
    else
        warn "未找到 Android ${ANDROID_VERSION} ${ANDROID_ABI} release APK，无法发布 /mobile/${ANDROID_APK_FILENAME}"
        warn "请先运行 pnpm --dir desktop build:android:arm64，或通过 ANDROID_APK=/path/to/app.apk 指定源文件"
        exit 1
    fi

    local resolved_windows_exe
    resolved_windows_exe="$(resolve_windows_exe || true)"
    if [ -n "$resolved_windows_exe" ]; then
        mkdir -p "$SCRIPT_DIR/dist/gitmemo/desktop/windows"
        cp "$resolved_windows_exe" "$SCRIPT_DIR/dist/gitmemo/desktop/windows/$WINDOWS_EXE_FILENAME"
        cp "$resolved_windows_exe" "$SCRIPT_DIR/dist/gitmemo/desktop/windows/$WINDOWS_STABLE_EXE_FILENAME"
        log "Windows x64 安装包已复制到 /desktop/windows/${WINDOWS_EXE_FILENAME}"
        log "Windows x64 稳定下载别名已复制到 /desktop/windows/${WINDOWS_STABLE_EXE_FILENAME}"
        info "Windows 安装包源文件: $resolved_windows_exe"
    else
        warn "未找到 Windows ${WINDOWS_VERSION} x64 安装包，跳过 /desktop/windows 下载文件"
        warn "可通过 WINDOWS_EXE=/path/to/GitMemo_x.y.z_x64-setup.exe 指定源文件"
    fi

    fix_for_china
    log "构建完成"
}

# ============================================
# 同步 Nginx 配置
# ============================================
sync_nginx() {
    log "========== 同步 Nginx 配置 =========="
    ssh "$ECS_SSH" "mkdir -p $ECS_DIR/deploy/nginx/conf.d"
    rsync -avz --progress \
        "$SCRIPT_DIR/nginx/conf.d/gitmemo.conf" \
        "$ECS_SSH:$ECS_DIR/deploy/nginx/conf.d/gitmemo.conf"

    log "重载 Nginx..."
    ssh "$ECS_SSH" "cd $ECS_DIR && docker compose exec nginx nginx -s reload"
    log "Nginx 配置同步完成"
}

# ============================================
# 同步静态文件
# ============================================
sync_website() {
    log "========== 同步 GitMemo 静态文件 =========="
    ssh "$ECS_SSH" "mkdir -p $ECS_DIR/deploy/dist/gitmemo"
    rsync -avz --progress --delete \
        "$SCRIPT_DIR/dist/gitmemo/" \
        "$ECS_SSH:$ECS_DIR/deploy/dist/gitmemo/"
    log "静态文件同步完成"
}

# ============================================
# 主流程
# ============================================

if [ "$NGINX_ONLY" = true ]; then
    sync_nginx
    exit 0
fi

if [ "$SKIP_BUILD" = false ]; then
    build_website
fi

sync_website
sync_nginx

log "=========================================="
log "GitMemo 国内站部署完成！"
log "=========================================="
