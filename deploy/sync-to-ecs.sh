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
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEBSITE_DIR="$PROJECT_DIR/website"

# 加载本地配置
if [ -f "$SCRIPT_DIR/.env.local" ]; then
    source "$SCRIPT_DIR/.env.local"
fi

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

# ============================================
# 替换 Google Fonts 为国内镜像
# ============================================
fix_fonts_for_china() {
    log "替换 Google Fonts 为国内 CDN 镜像..."
    local dist_index="$SCRIPT_DIR/dist/gitmemo/index.html"
    if [ -f "$dist_index" ]; then
        # 替换 fonts.googleapis.com → fonts.googleapis.cn (Google 中国镜像)
        # 替换 fonts.gstatic.com → fonts.gstatic.cn
        sed -i '' \
            -e 's|https://fonts.googleapis.com|https://fonts.googleapis.cn|g' \
            -e 's|https://fonts.gstatic.com|https://fonts.gstatic.cn|g' \
            "$dist_index"
        log "字体 CDN 替换完成"
    else
        warn "未找到 dist/index.html，跳过字体替换"
    fi
}

# ============================================
# 构建
# ============================================
build_website() {
    log "========== 构建 GitMemo 官网 =========="
    cd "$WEBSITE_DIR"
    npm run build
    cd "$PROJECT_DIR"

    rm -rf "$SCRIPT_DIR/dist/gitmemo"
    mkdir -p "$SCRIPT_DIR/dist"
    cp -r "$WEBSITE_DIR/dist" "$SCRIPT_DIR/dist/gitmemo"

    fix_fonts_for_china
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
