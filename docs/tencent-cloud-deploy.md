# AnyKnews Tencent Cloud Launch Runbook

This document is the first-production-launch checklist for AnyKnews on a Tencent Cloud CVM.

The current production target is intentionally lightweight:

- One Docker Compose service: `app`
- No Postgres, Redis, or persistent database
- Data is fetched on page open/manual refresh and held in the server process TTL cache plus a compact disk cache
- Source subscriptions and drag ordering are browser-local localStorage state
- V1.1 keeps legacy favorite/keyword/ignore localStorage data for future reuse, but those controls are hidden from the current user-facing UI
- Notification code is kept in the app, but cron delivery is not enabled for the first launch

## 1. Local Preflight

Run these checks before uploading or pulling code on the server.

```bash
npm run lint
npm run build
docker compose config
docker compose build app
docker compose up -d app
curl http://127.0.0.1:3000/api/health
```

Expected health result:

- `status` is `ok`
- `runtime.cacheMode` is `memory`
- `sources.sourceCount` matches the current loaded catalog/source set. The V1.1 catalog target is 28 sources, with 13 default subscribed sources on first run.
- `notification.notificationTokenConfigured` can be `false` for the first launch

Run one forced source refresh:

```bash
curl -sS "http://127.0.0.1:3000/api/boards?refresh=force"
```

At the time of the V1.1 launch review, the catalog target was 28 sources. The current connector table in `README.md` is the source of truth for expected source methods and fallback status.

These sources may still use fallback data under source-side limits:

- 36氪: `资讯-推荐` page normally uses embedded page JSON, but can still return captcha/anti-crawl content from the server environment
- 雪球: hot topics can use anonymous cookies, but `XUEQIU_COOKIE` is still more stable in production
- RSSHub/60s-backed sources: availability depends on the public upstream service and should be validated after deploy

This fallback state is acceptable for the first launch.

## 2. Tencent Cloud Prerequisites

Prepare the CVM instance:

- OS: Ubuntu LTS or TencentOS is fine
- Docker Engine installed
- Docker Compose plugin installed, so `docker compose version` works
- Security group allows SSH port `22`
- Security group allows app port `3000` for the first validation
- Later, if binding a domain, expose `80` and `443` through Nginx/Caddy instead of exposing only `3000`

Do not expose database ports. The current app does not need `5432` or `6379`.

Recommended project path:

```bash
sudo mkdir -p /opt/anyknews
sudo chown -R "$USER:$USER" /opt/anyknews
cd /opt/anyknews
```

## 3. Put Code On The Server

Use the Git repository as the release source:

```bash
cd /opt
git clone <your-repo-url> anyknews
cd /opt/anyknews
```

For an existing deployment directory, keep the server `.env`, then switch the code directory to the Git remote:

```bash
cd /opt/anyknews
git remote -v
git fetch origin
git checkout v1.1
git pull --ff-only origin v1.1
```

## 4. Configure `.env`

Create the server env file:

```bash
cd /opt/anyknews
cp .env.example .env
```

Edit `.env`:

```bash
nano .env
```

For the first launch, use this minimal production shape:

```bash
APP_BASE_URL=http://<server-public-ip>:3000
TZ=Asia/Shanghai
NODE_IMAGE=mirror.gcr.io/library/node:22-alpine

ANYKNEWS_CACHE_TTL_SECONDS=600
ANYKNEWS_ERROR_CACHE_TTL_SECONDS=120
ANYKNEWS_GITHUB_CACHE_TTL_SECONDS=3600
ANYKNEWS_ZHIHU_CACHE_TTL_SECONDS=120
ANYKNEWS_SOURCE_ITEM_LIMIT=50

ZHIHU_COOKIE=
XUEQIU_COOKIE=
RSSHUB_BASE_URL=

NOTIFICATION_API_TOKEN=
FEISHU_WEBHOOK_URL=
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
EMAIL_TO=
AI_DIGEST_SOURCE_LIMIT=4
AI_DIGEST_FEISHU_SOURCE_LIMIT=3
```

Important:

- Keep notification variables empty for the first launch.
- Do not commit `.env`.
- If Docker Hub is fast on the server, `NODE_IMAGE` can be changed to `node:22-alpine`.
- If Tencent Cloud cannot reach `mirror.gcr.io`, replace `NODE_IMAGE` with an available registry mirror.

## 5. Start The App

Validate Compose first:

```bash
docker compose config
```

Build and start:

```bash
docker compose up -d --build app
```

Check status and logs:

```bash
docker compose ps
docker compose logs -f app
```

The app should listen on:

```text
http://<server-public-ip>:3000
```

## 6. Production Verification

Run these commands on the server:

```bash
curl http://127.0.0.1:3000/api/health
```

Then force a full refresh:

```bash
curl -sS "http://127.0.0.1:3000/api/boards?refresh=force"
```

Open the page from your browser:

```text
http://<server-public-ip>:3000
```

Verify manually:

- 首页卡片墙正常展示
- 每个卡片默认展示 8 条
- 上一页/下一页可以翻看 50 条以内的数据
- 外链点击会打开新 tab
- 手动刷新按钮可以触发最新拉取
- 点击顶部分类后，当前页筛选为对应分类的全部来源
- `订阅设置` 是顶层管理页面，不展示具体新闻卡片
- `订阅设置` 左侧订阅清单和右侧来源目录在桌面端独立滚动
- 来源目录卡片展示 icon、名称、一句话简介、推荐指数和预览入口
- 每个分类内的来源按照推荐指数从高到低排序
- `看板洞察` 默认折叠，展开后可查看趋势雷达、事件聚合和源诊断
- AI 资讯包含 AIbase，不再包含机器之心
- 雪球卡片显示热门话题
- 36氪、雪球如果显示 fallback，不阻塞首次上线

## 7. Notifications: Keep Disabled Initially

Notification endpoints are already implemented, but the current launch decision is to keep them out of production scheduling until the template is refined.

Do not add cron jobs during first launch.

When you later decide to enable notifications:

1. Set a long random `NOTIFICATION_API_TOKEN`.
2. Configure `FEISHU_WEBHOOK_URL` and/or SMTP variables in `.env`.
3. Restart the app.
4. Test with `dryRun` first.

Dry-run example:

```bash
curl -fsS -X POST http://127.0.0.1:3000/api/notifications/digest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NOTIFICATION_API_TOKEN" \
  --data '{"digest":"morning","channels":["feishu","email"],"dryRun":true,"includePreview":true}'
```

Later cron examples:

```cron
0 10 * * * curl -fsS -X POST http://127.0.0.1:3000/api/notifications/digest -H "Content-Type: application/json" -H "Authorization: Bearer $NOTIFICATION_API_TOKEN" --data '{"digest":"morning","channels":["feishu","email"]}'
10 10 * * 1 curl -fsS -X POST http://127.0.0.1:3000/api/notifications/digest -H "Content-Type: application/json" -H "Authorization: Bearer $NOTIFICATION_API_TOKEN" --data '{"digest":"weekly-github","channels":["feishu","email"]}'
*/30 * * * * curl -fsS -X POST http://127.0.0.1:3000/api/notifications/digest -H "Content-Type: application/json" -H "Authorization: Bearer $NOTIFICATION_API_TOKEN" --data '{"digest":"zhihu","channels":["feishu"],"refresh":false}'
```

## 8. Common Operations

View service:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f app
```

Restart:

```bash
docker compose restart app
```

Rebuild after code changes:

```bash
docker compose up -d --build app
```

Stop:

```bash
docker compose down
```

## 9. Update Flow

If using Git:

```bash
cd /opt/anyknews
git pull --ff-only
docker compose up -d --build app
curl http://127.0.0.1:3000/api/health
```

## 10. Rollback

The simplest rollback is directory-based:

1. Keep a copy of the previous deploy directory, for example `/opt/anyknews.prev`.
2. Stop the current service:

```bash
cd /opt/anyknews
docker compose down
```

3. Start the previous directory:

```bash
cd /opt/anyknews.prev
docker compose up -d app
```

For a more formal production setup later, tag Docker images per release and roll back by image tag.

## 11. Troubleshooting

Port `3000` is unavailable:

```bash
docker ps
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Stop the old service or change the host port in `docker-compose.yml`.

Source cards show fallback data:

- First run `curl -sS "http://127.0.0.1:3000/api/boards?refresh=force"`.
- Check `docker compose logs -f app`.
- 36氪 anti-crawl/captcha and 雪球 auth limits are known source-side limits.

Docker build cannot pull Node image:

- Keep `NODE_IMAGE=mirror.gcr.io/library/node:22-alpine`, or
- Replace it with a registry mirror reachable from the Tencent Cloud instance.

Health says notifications are not configured:

- This is expected for the first launch.
- Only configure notification env vars when you are ready to enable digest delivery.

Old local Postgres/Redis containers appear:

- They are from the earlier architecture and are not used by the current Compose file.
- Do not expose or recreate them on Tencent Cloud.
