# AnyKnews

Personal information-link aggregation dashboard.

## Current Status

- Frontend: compact card wall with category-tinted source cards and a collapsed board-insights drawer.
- API: `/api/boards`, `/api/sources/:sourceId/refresh`, `/go/:itemId`.
- Notifications: `/api/notifications/digest` for Feishu/email digests.
- Data: no database. Source results live in an in-process TTL cache with typed seed fallback.
- Connectors: on-demand refresh for the configured source list, with DailyHotApi/RSSHub fallbacks where available and seed data retained when a source blocks unauthenticated access.
- Personalization: browser-local source subscriptions, drag ordering, hidden sources, favorites, ignored items, focus keywords and blocked keywords.
- Intelligence: trend radar, new-item movement, event clustering and source diagnostics derived from the currently loaded board data, tucked under the collapsed `看板洞察` section.
- Infra: Docker Compose for the app only.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Opening the dashboard calls `/api/boards?refresh=stale`, which refreshes only sources whose cache has expired. The header refresh action refreshes the currently visible sources one by one.

## Dashboard Features

- Card pagination: each source card shows 8 items per page while each connector can fetch up to `ANYKNEWS_SOURCE_ITEM_LIMIT` items.
- Source subscriptions: the first navigation item is `我的订阅`; first-run defaults keep all current sources subscribed, and users can unsubscribe or hide sources locally.
- Drag ordering: subscribed sources can be reordered in the source manager with browser-native drag and drop.
- Local personalization: favorite, ignore, focus keyword and blocked keyword rules are stored in browser `localStorage`.
- Focus view: default focus keywords are `AI agent`, `机器人`, and `项目管理`; users can add or remove keywords in the rule panel.
- Local reset: clear `anyknews.preferences.v2` in browser localStorage to reset source subscriptions, ordering and keyword preferences.
- Board insights: trend radar, event clustering and source diagnostics are available under the compact `看板洞察` drawer below the main title. The drawer is collapsed by default so the user-facing page stays focused on source cards.

## Cache Runtime

AnyKnews intentionally avoids Postgres/Redis in the current lightweight version. The server process keeps source results in memory and falls back to typed seed data if a source fails or has not been fetched yet.

Optional cache TTL environment variables:

```bash
ANYKNEWS_CACHE_TTL_SECONDS=600
ANYKNEWS_ERROR_CACHE_TTL_SECONDS=120
ANYKNEWS_GITHUB_CACHE_TTL_SECONDS=3600
ANYKNEWS_ZHIHU_CACHE_TTL_SECONDS=120
ANYKNEWS_SOURCE_ITEM_LIMIT=50
ANYKNEWS_DAILYHOT_BASE_URL=https://api-hot.imsyy.top
ANYKNEWS_PUBLIC_RSSHUB_BASE_URLS=https://rsshub.app,https://rsshub.rssforever.com
```

## Connector Status

| Source | Status | Method |
| --- | --- | --- |
| 量子位 | Working | RSS |
| AIbase | Working | First-party news page, RSSHub `/aibase/news` fallback |
| GitHub Trending | Working | HTML |
| V2EX | Working | JSON API |
| 知乎热榜 | Working | Public Zhihu hot-list API, DailyHotApi fallback, optional `ZHIHU_COOKIE`/RSSHub fallback |
| 今日头条热榜 | Working | JSON hot-board endpoint, DailyHotApi fallback |
| 澎湃新闻 | Working | HTML, DailyHotApi fallback |
| 36氪 | Working with fallback | `资讯-推荐` embedded page JSON, DailyHotApi fallback |
| B 站热门 | Working | JSON API, DailyHotApi fallback |
| 游民星空 | Working | HTML |
| 雪球 | Working with fallback | First-party hot topics endpoint with anonymous cookie, RSSHub `/xueqiu/today` fallback; set `XUEQIU_COOKIE` for stable production use |
| 财新 | Working | HTML |
| 汽车之家 | Working | `今日焦点`/latest list HTML |

## Verification

```bash
npm run lint
npm run build
docker compose config
```

## Release Flow

For the current lightweight deployment, publish code through Git and update the Tencent Cloud app from the remote repository:

```bash
git push
ssh <server-user>@<server-ip>
cd /opt/anyknews
git pull --ff-only
docker compose up -d --build app
curl -fsS http://127.0.0.1:3000/api/health
```

Keep `.env` only on the server. Notifications remain disabled unless the digest template is intentionally enabled.

For Tencent Cloud launch steps, see [docs/tencent-cloud-deploy.md](/Users/Reuxs/workspace/creative/daily_news_platform/docs/tencent-cloud-deploy.md).

## Notifications

The digest API can send AI, weekly GitHub, Zhihu, morning or combined digests. This feature is implemented and verified, but it is optional for deployment. Keep notification environment variables and cron jobs disabled until the digest template is ready to go live.

```bash
curl -X POST http://localhost:3000/api/notifications/digest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NOTIFICATION_API_TOKEN" \
  --data '{"digest":"ai","channels":["feishu","email"]}'
```

Supported `digest` values: `ai`, `github`, `weekly-github`, `zhihu`, `morning`, `all`.

`morning` is the recommended 10:00 digest. It includes the previous day's AI items only, grouped by source with summaries, intro notes and tags. GitHub Trending is sent separately as `weekly-github`.

Add `"dryRun":true` and `"includePreview":true` to validate digest generation without sending messages.

```bash
curl -X POST http://localhost:3000/api/notifications/digest \
  -H "Content-Type: application/json" \
  --data '{"digest":"morning","channels":["feishu","email"],"dryRun":true,"includePreview":true}'
```

The deployment health endpoint exposes non-secret runtime and notification readiness:

```bash
curl http://localhost:3000/api/health
```

Cron examples for later use:

```cron
0 10 * * * curl -fsS -X POST http://127.0.0.1:3000/api/notifications/digest -H "Content-Type: application/json" -H "Authorization: Bearer $NOTIFICATION_API_TOKEN" --data '{"digest":"morning","channels":["feishu","email"]}'
10 10 * * 1 curl -fsS -X POST http://127.0.0.1:3000/api/notifications/digest -H "Content-Type: application/json" -H "Authorization: Bearer $NOTIFICATION_API_TOKEN" --data '{"digest":"weekly-github","channels":["feishu","email"]}'
*/30 * * * * curl -fsS -X POST http://127.0.0.1:3000/api/notifications/digest -H "Content-Type: application/json" -H "Authorization: Bearer $NOTIFICATION_API_TOKEN" --data '{"digest":"zhihu","channels":["feishu"],"refresh":false}'
```

Do not add these cron jobs during the first Tencent Cloud launch unless notifications are intentionally enabled.

## Local Services

```bash
cp .env.example .env
```

To run the full local stack in Docker:

```bash
docker compose up -d --build
```

`NODE_IMAGE` defaults to `mirror.gcr.io/library/node:22-alpine` for local builds in networks where Docker Hub is unreliable. Override it in `.env` if your server has a preferred registry mirror.
