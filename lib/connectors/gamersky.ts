import { ensureItems, extractLinksFromHtml, fetchText, SOURCE_FETCH_LIMIT } from "@/lib/connectors/shared";
import type { SourceConnector } from "@/lib/connectors/types";

const gamerskyUrl = "https://www.gamersky.com/news/";

export const gamerskyConnector: SourceConnector = {
  id: "gamersky",
  label: "Gamersky News",
  async fetchItems() {
    const html = await fetchText(gamerskyUrl);
    return ensureItems(
      extractLinksFromHtml(html, {
        baseUrl: gamerskyUrl,
        hrefIncludes: ["gamersky.com/news/"],
        limit: SOURCE_FETCH_LIMIT * 2,
        minTitleLength: 8
      })
        .filter((item, index, items) => {
          const canonicalUrl = item.url.split("#")[0];
          return items.findIndex((candidate) => candidate.url.split("#")[0] === canonicalUrl) === index;
        })
        .slice(0, SOURCE_FETCH_LIMIT)
        .map((item, index) => ({
          ...item,
          metric: index === 0 ? "新" : `${index + 1}`
        })),
      this.label
    );
  }
};
