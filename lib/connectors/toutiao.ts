import { compactNumber, ensureItems, fetchJson, SOURCE_FETCH_LIMIT } from "@/lib/connectors/shared";
import { fetchDailyHotItems } from "@/lib/connectors/dailyhot";
import type { SourceConnector } from "@/lib/connectors/types";

const toutiaoHotUrl = "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc";

type ToutiaoHotResponse = {
  data?: Array<{
    ClusterIdStr?: string;
    HotValue?: string;
    LabelDesc?: string;
    QueryWord?: string;
    Title?: string;
    Url?: string;
  }>;
};

export const toutiaoConnector: SourceConnector = {
  id: "toutiao",
  label: "Toutiao Hot Board",
  async fetchItems() {
    try {
      const payload = await fetchJson<ToutiaoHotResponse>(toutiaoHotUrl, {
        Referer: "https://www.toutiao.com"
      });

      return ensureItems(
        (payload.data ?? []).slice(0, SOURCE_FETCH_LIMIT).map((item, index) => ({
          externalId: item.ClusterIdStr ?? `${index + 1}`,
          metric: item.HotValue ? compactNumber(Number(item.HotValue)) : `${index + 1}`,
          raw: item,
          summary: item.LabelDesc ?? item.QueryWord ?? "",
          title: item.Title ?? item.QueryWord ?? "",
          url: item.ClusterIdStr
            ? `https://www.toutiao.com/trending/${item.ClusterIdStr}/`
            : item.Url ?? "https://www.toutiao.com"
        })).filter((item) => item.title),
        this.label
      );
    } catch {
      return fetchDailyHotItems("toutiao", `${this.label} DailyHot`);
    }
  }
};
