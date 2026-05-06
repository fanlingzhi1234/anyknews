import { ensureItems, extractLinksFromHtml, fetchText } from "@/lib/connectors/shared";
import { fetchDailyHotItems } from "@/lib/connectors/dailyhot";
import type { SourceConnector } from "@/lib/connectors/types";

const thePaperUrl = "https://www.thepaper.cn";

export const thePaperConnector: SourceConnector = {
  id: "the-paper",
  label: "The Paper Home",
  async fetchItems() {
    try {
      const html = await fetchText(thePaperUrl);
      return ensureItems(
        extractLinksFromHtml(html, {
          baseUrl: thePaperUrl,
          hrefIncludes: ["newsDetail_forward_"],
          minTitleLength: 10
        }),
        this.label
      );
    } catch {
      return fetchDailyHotItems("thepaper", `${this.label} DailyHot`);
    }
  }
};
