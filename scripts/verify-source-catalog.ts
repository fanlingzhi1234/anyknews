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

for (const source of sourceCatalog) {
  if (!source.seedItems.length) {
    throw new Error(`${source.id} has no seed items`);
  }

  if (source.catalogStatus === "catalog-only" && source.defaultSubscribed) {
    throw new Error(`${source.id} is catalog-only but default subscribed`);
  }

  if (source.catalogStatus === "live" && !getConnector(source.id)) {
    throw new Error(`${source.id} is live but has no connector`);
  }
}

console.log(`Verified ${sourceCatalog.length} sources, ${defaultSubscribedSourceIds.length} default subscribed.`);
