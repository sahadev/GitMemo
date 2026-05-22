# GitMemo 国内站部署指南

> 部署到与 kakacut 相同的 ECS 服务器，共用 Nginx 容器

## 前置条件

- ECS 服务器已运行 kakacut 的 Docker Compose 环境
- DNS 已有通配符解析 `*.kakacut.cn → 101.200.217.80`
- SSL 证书需要包含 `gitmemo.kakacut.cn`

## 一、首次部署（一次性操作）

### 1. 添加 SSL 域名

SSH 到 ECS，在 certbot 续签时加入新域名：

```bash
ssh root@101.200.217.80

# 停止 nginx
cd /opt/kakacut && docker compose stop nginx

# 重新签发证书（加入 gitmemo 子域）
certbot certonly --standalone \
  -d api.kakacut.cn \
  -d admin.kakacut.cn \
  -d calc.kakacut.cn \
  -d phunt.kakacut.cn \
  -d gitmemo.kakacut.cn

# 复制新证书到部署目录
cp /etc/letsencrypt/live/api.kakacut.cn/fullchain.pem /opt/kakacut/deploy/nginx/ssl/subdomains.pem
cp /etc/letsencrypt/live/api.kakacut.cn/privkey.pem /opt/kakacut/deploy/nginx/ssl/subdomains.key

# 重启 nginx
docker compose start nginx
```

### 2. 修改 docker-compose.yml

在 nginx 的 volumes 中添加 gitmemo 目录映射：

```yaml
nginx:
  volumes:
    # ... 已有 volumes ...
    - ./deploy/dist/gitmemo:/usr/share/nginx/gitmemo:ro
```

然后重启容器：

```bash
cd /opt/kakacut
docker compose up -d nginx
```

### 3. 在 ECS 创建目标目录

```bash
mkdir -p /opt/kakacut/deploy/dist/gitmemo
```

## 二、日常部署

在本地 Mac 执行：

```bash
cd /Users/Zhuanz/Code/other/GitMemo-desktop

# 完整构建 + 部署
./deploy/sync-to-ecs.sh

# 跳过构建，仅同步已有产物
./deploy/sync-to-ecs.sh --skip-build

# 仅更新 Nginx 配置
./deploy/sync-to-ecs.sh --nginx-only
```

如需让下载区优先走 OSS，在 `deploy/.env.local` 中配置：

```bash
VITE_DOWNLOAD_MANIFEST_URL=https://你的bucket.oss-cn-hangzhou.aliyuncs.com/downloads.json
```

`VITE_DOWNLOAD_MANIFEST_URL` 是 Vite 构建期变量，必须在执行 `npm run build` 时存在。部署脚本会读取 `deploy/.env.local` 并注入到构建命令；未配置时下载区会回退 GitHub Releases。

Release 下载包不在本地官网部署脚本中同步。构建产物同步 OSS 的逻辑在 GitHub Actions 的 `sync-oss` job 中，构建完成后会自动收集 `.dmg`、`.app.tar.gz`、签名文件和 CLI 二进制，生成 `downloads.json` / `latest.json`，上传到 OSS，并按保留策略删除旧版本目录。

需要在 GitHub 仓库中配置这些 Secrets：

```bash
ALIYUN_ACCESS_KEY_ID
ALIYUN_ACCESS_KEY_SECRET
ALIYUN_OSS_BUCKET
ALIYUN_OSS_REGION
```

如使用自定义 OSS 绑定域名或 CDN，还可以配置 GitHub Actions Variable：

```bash
ALIYUN_OSS_PUBLIC_BASE_URL
```

## 三、Google Fonts 处理

部署脚本会自动将 `fonts.googleapis.com` 替换为 `fonts.googleapis.cn`（Google 中国镜像），确保国内用户字体加载正常。

## 四、SEO 注意事项

1. **百度站长平台**：验证 `gitmemo.kakacut.cn`，提交 sitemap
2. **搜狗站长平台**：同步验证
3. **robots.txt**：Nginx 配置中已内联返回
4. **sitemap.xml**：需要生成并放入 dist（TODO）

## 五、后续升级为独立域名

如果将来注册并备案 `gitmemo.cn`：

1. 修改 `deploy/nginx/conf.d/gitmemo.conf` 中的 `server_name`
2. 申请独立 SSL 证书
3. 配置 301 重定向从 `gitmemo.kakacut.cn` → `gitmemo.cn`
4. 更新百度站长平台的 sitemap 地址

## 六、目录结构

```
GitMemo-desktop/
├── deploy/
│   ├── sync-to-ecs.sh          # 部署脚本
│   ├── DEPLOY-CN.md            # 本文档
│   ├── nginx/
│   │   └── conf.d/
│   │       └── gitmemo.conf    # Nginx 虚拟主机配置
│   └── dist/
│       └── gitmemo/            # 构建产物（gitignore）
└── website/                    # 网站源码
```
