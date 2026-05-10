# AnyKnews

Personal information-link aggregation dashboard.

## Current Status

- Frontend: compact card wall with category-tinted source cards and a collapsed board-insights drawer.
- API: `/api/boards`, `/api/sources/:sourceId/refresh`, `/api/sources/:sourceId/items`, `/go/:itemId`.
- Notifications: `/api/notifications/digest` for Feishu/email digests.
- Data: no database. Source results live in an in-process TTL cache plus a compact disk cache with typed seed fallback.
- Connectors: on-demand refresh for the configured source list, with DailyHotApi/RSSHub fallbacks where available and seed data retained when a source blocks unauthenticated access.
- Personalization: browser-local source subscriptions and drag ordering. V1.1 keeps older favorite/keyword/ignore localStorage fields for future reuse, but temporarily hides those controls from the user-facing UI.
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

- Card pagination: each source card shows 8 items per page; later pages are loaded from the single-source item API on demand.
- Source subscriptions: the top navigation includes `我的订阅` for the news board and `订阅设置` for source management. First-run defaults keep the current core sources subscribed.
- Subscription settings: the management page does not show news cards. It uses an independent left subscribed-source list and a right source catalog grouped by category.
- Source catalog: each source record shows icon, title, one-line intro, recommendation score and a preview action. Sources inside each category are sorted by recommendation score from high to low.
- Drag ordering: subscribed sources can be reordered, and catalog sources can be dragged or added into `我的订阅`.
- Local reset: clear `anyknews.preferences.v2` in browser localStorage, or use the reset action in `订阅设置`, to restore default subscriptions and ordering.
- Board insights: trend radar, event clustering and source diagnostics are available under the compact `看板洞察` drawer below the main title. The drawer is collapsed by default so the user-facing page stays focused on source cards.

## V1.1 Source Catalog And Cost Control

AnyKnews intentionally avoids Postgres/Redis in the current lightweight version. The browser sends the subscribed source ids to the server, and the server fetches only those selected sources.

- Page open requests subscribed source ids and the first 8 items per source.
- Low-cost subscribed sources refresh when stale.
- Medium/high-cost subscribed sources refresh on page open only when the last successful refresh is older than 10 minutes.
- Card pagination calls `/api/sources/:sourceId/items` and loads more items only for that source.
- Manual card refresh fetches only that source and scrolls back to that card.
- The server writes a compact disk cache at `.cache/anyknews/source-cache.json`.
- The disk cache stores source metadata, title, summary, link, metrics, timestamps, diagnostics and backoff state.
- The disk cache does not store full HTML, article bodies, images or raw connector payloads.

Optional runtime environment variables:

```bash
ANYKNEWS_DISK_CACHE_PATH=.cache/anyknews/source-cache.json
ANYKNEWS_DISABLE_DISK_CACHE=false
ANYKNEWS_CACHE_TTL_SECONDS=600
ANYKNEWS_ERROR_CACHE_TTL_SECONDS=120
ANYKNEWS_FAILURE_BACKOFF_SECONDS=300
ANYKNEWS_GITHUB_CACHE_TTL_SECONDS=3600
ANYKNEWS_ZHIHU_CACHE_TTL_SECONDS=120
ANYKNEWS_BOARD_ITEM_LIMIT=8
ANYKNEWS_SOURCE_PAGE_ITEM_LIMIT=8
ANYKNEWS_SOURCE_ITEM_LIMIT=50
ANYKNEWS_MAX_BOARD_SOURCES=80
DAILYHOT_API_BASE_URL=https://api-hot.imsyy.top
ANYKNEWS_DAILYHOT_BASE_URL=https://api-hot.imsyy.top
ANYKNEWS_SIXTY_SECONDS_BASE_URLS=https://60s.viki.moe
ANYKNEWS_PUBLIC_RSSHUB_BASE_URLS=https://rsshub.app,https://rsshub.rssforever.com,https://rsshub.agrreader.com,https://rsshub.chn.moe,https://rsshub.gneko.io,https://rsshub.ddsrem.com,https://rsshub.ixk.me
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
| Hacker News | Working | Official Firebase API |
| Anthropic News | Working | Official news page HTML |
| InfoQ | Working with fallback | RSSHub recipe |
| 少数派 | Working | First-party hot article API |
| 虎嗅 | Working with fallback | RSSHub route fallback |
| 界面 | Working with fallback | RSSHub recipe |
| 华尔街见闻 | Working with fallback | RSSHub recipe |
| 东方财富 | Working with fallback | Public fast-news endpoint, homepage HTML fallback |
| 懂车帝 | Working with fallback | 60s API |
| 晚点 | Working with fallback | HTML recipe |
| 钛媒体 | Working with fallback | RSSHub recipe |
| 微博热搜 | Working with fallback | 60s API |
| 抖音热点 | Working with fallback | 60s API |
| 小红书热点 | Working with fallback | 60s API |
| 豆瓣 | Working with fallback | RSSHub route fallback |

## Verification

```bash
npx tsx scripts/verify-source-catalog.ts
npx tsx scripts/verify-refresh-policy.ts
npx tsx scripts/verify-source-cache-store.ts
npx tsc --noEmit
npm run lint
npm run build
docker compose config
```

## CI/CD And Release Governance

AnyKnews follows the shared Codex workspace release standard in `docs/codex-workspace-cicd-standard.md`.

- Development happens on feature or version branches.
- User-accepted version branches are merged into `main`.
- Tencent Cloud production deploys only from `main` or an immutable release tag.
- `.github/workflows/ci.yml` runs catalog verification, refresh-policy verification, disk-cache verification, type check, lint and production build on pull requests, `main`, and version branches.
- `AGENTS.md` records the Codex-specific release guardrails for this repo.

## Release Flow

For the current lightweight deployment, publish code through Git and update the Tencent Cloud app from the remote repository:

```bash
git checkout main
git pull --ff-only origin main
git merge --ff-only <accepted-version-branch>
git push origin main
ssh <server-user>@<server-ip>
cd /opt/anyknews
git fetch origin --tags
git checkout main
git pull --ff-only origin main
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
