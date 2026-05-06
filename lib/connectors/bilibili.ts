import { compactNumber, ensureItems, fetchJson, SOURCE_FETCH_LIMIT } from "@/lib/connectors/shared";
import { fetchDailyHotItems } from "@/lib/connectors/dailyhot";
import type { SourceConnector } from "@/lib/connectors/types";

const bilibiliPopularUrl = `https://api.bilibili.com/x/web-interface/popular?ps=${SOURCE_FETCH_LIMIT}&pn=1`;

type BilibiliPopularResponse = {
  code: number;
  data?: {
    list?: Array<{
      bvid: string;
      desc?: string;
      owner?: {
        name?: string;
      };
      pubdate?: number;
      stat?: {
        view?: number;
      };
      title: string;
    }>;
  };
  message?: string;
};

export const bilibiliConnector: SourceConnector = {
  id: "ent",
  label: "Bilibili Popular",
  async fetchItems() {
    try {
      const payload = await fetchJson<BilibiliPopularResponse>(bilibiliPopularUrl, {
        Referer: "https://www.bilibili.com/v/popular/all"
      });

      if (payload.code !== 0) {
        throw new Error(`Bilibili API error: ${payload.message ?? payload.code}`);
      }

      return ensureItems(
        (payload.data?.list ?? []).slice(0, SOURCE_FETCH_LIMIT).map((item) => ({
          externalId: item.bvid,
          metric: compactNumber(item.stat?.view),
          publishedAt: item.pubdate ? new Date(item.pubdate * 1000).toISOString() : undefined,
          raw: { owner: item.owner?.name },
          summary: item.owner?.name ?? item.desc ?? "",
          title: item.title,
          url: `https://www.bilibili.com/video/${item.bvid}`
        })),
        this.label
      );
    } catch {
      return fetchDailyHotItems("bilibili", `${this.label} DailyHot`);
    }
  }
};
