import { getConnector } from "@/lib/connectors";
import { defaultSubscribedSourceIds, sourceCatalog } from "@/lib/sources/catalog";

const expectedNewIds = [
  "hacker-news",
  "anthropic-news",
  "infoq",
  "sspai",
  "huxiu",
  "jiemian",
  "wallstreetcn",
  "eastmoney",
  "dongchedi",
  "latepost",
  "tmtpost",
  "weibo-hot",
  "douyin-hot",
  "xiaohongshu-hot",
  "douban"
];

const expectedDefaultIds = [
  "ai",
  "aibase",
  "tech",
  "v2ex",
  "general",
  "toutiao",
  "the-paper",
  "biz",
  "ent",
  "gamersky",
  "finance",
  "caixin",
  "auto"
];

const expectedCatalogOnlyIds: string[] = [];

const ids = sourceCatalog.map((source) => source.id);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) {
  throw new Error(`Duplicate source ids: ${duplicates.join(", ")}`);
}

for (const id of expectedNewIds) {
  if (!ids.includes(id)) {
    throw new Error(`Missing V1.1 source: ${id}`);
  }
}

if (defaultSubscribedSourceIds.length < 10) {
  throw new Error(`Expected current default subscriptions to be preserved, got ${defaultSubscribedSourceIds.length}`);
}

if (defaultSubscribedSourceIds.join(",") !== expectedDefaultIds.join(",")) {
  throw new Error(`Default subscriptions changed: ${defaultSubscribedSourceIds.join(",")}`);
}

const liveIdsWithoutConnectors: string[] = [];

for (const source of sourceCatalog) {
  if (!source.seedItems.length) {
    throw new Error(`${source.id} has no seed items`);
  }

  if (source.catalogStatus === "catalog-only" && source.defaultSubscribed) {
    throw new Error(`${source.id} is catalog-only but default subscribed`);
  }

  if (source.catalogStatus === "live" && !getConnector(source.id)) {
    liveIdsWithoutConnectors.push(source.id);
  }
}

if (liveIdsWithoutConnectors.length) {
  throw new Error(`Live sources without connectors: ${liveIdsWithoutConnectors.join(", ")}`);
}

const catalogOnlyIds = sourceCatalog
  .filter((source) => source.catalogStatus === "catalog-only")
  .map((source) => source.id)
  .sort();

if (catalogOnlyIds.join(",") !== expectedCatalogOnlyIds.join(",")) {
  throw new Error(
    `Expected only ${expectedCatalogOnlyIds.join(",")} to be catalog-only, got ${catalogOnlyIds.join(",") || "(none)"}`
  );
}

console.log(`Verified ${sourceCatalog.length} sources, ${defaultSubscribedSourceIds.length} default subscribed.`);
