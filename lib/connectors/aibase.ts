import { load } from "cheerio";
import {
  ensureItems,
  fetchText,
  getPublicRssHubRoutes,
  getRssHubRoute,
  normalizeText,
  parseRssItems,
  SOURCE_FETCH_LIMIT
} from "@/lib/connectors/shared";
import type { FetchedItem, SourceConnector } from "@/lib/connectors/types";

const aibaseNewsUrl = "https://news.aibase.com/zh/news";

export const aibaseConnector: SourceConnector = {
  id: "aibase",
  label: "AIbase News",
  async fetchItems() {
    const rssHubUrls = [
      getRssHubRoute("/aibase/news"),
      ...getPublicRssHubRoutes("/aibase/news")
    ].filter(Boolean) as string[];

    for (const rssHubUrl of rssHubUrls) {
      try {
        const xml = await fetchText(rssHubUrl, { timeoutMs: 3500 });
        return ensureItems(parseRssItems(xml, rssHubUrl), this.label);
      } catch {
        // Fall through to the first-party page; public RSSHub mirrors can be slow.
      }
    }

    const html = await fetchText(aibaseNewsUrl);
    return ensureItems(extractAibaseItems(html), this.label);
  }
};

function extractAibaseItems(html: string) {
  const $ = load(html);
  const seen = new Set<string>();
  const items: FetchedItem[] = [];

  $('a[href^="/zh/news/"]').each((index, element) => {
    if (items.length >= SOURCE_FETCH_LIMIT) {
      return false;
    }

    const linkElement = $(element);
    const href = linkElement.attr("href");
    const title = normalizeText(
      linkElement.find(".font600.mainColor").first().text() ||
        linkElement.find("img[alt]").first().attr("alt") ||
        linkElement.text()
    );

    if (!href || !title || seen.has(href)) {
      return;
    }

    const summary = normalizeText(linkElement.find(".tipColor.truncate2").first().text());
    const metaTexts = linkElement
      .find(".tipColor .flex")
      .map((_, node) => normalizeText($(node).text()))
      .get()
      .filter(Boolean);
    const metric = metaTexts.find((text) => /\d|K|万/i.test(text)) ?? (index === 0 ? "新" : `${index + 1}`);

    seen.add(href);
    items.push({
      externalId: href.replace(/^\/zh\/news\//, ""),
      metric,
      raw: { href, provider: "AIbase" },
      summary,
      title,
      url: new URL(href, aibaseNewsUrl).toString()
    });
  });

  return items;
}
