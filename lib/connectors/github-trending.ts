import { load } from "cheerio";
import { SOURCE_FETCH_LIMIT } from "@/lib/connectors/shared";
import type { FetchedItem, SourceConnector } from "@/lib/connectors/types";

const githubTrendingUrl = "https://github.com/trending?since=daily";

export const githubTrendingConnector: SourceConnector = {
  id: "tech",
  label: "GitHub Trending",
  async fetchItems() {
    const response = await fetch(githubTrendingUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "AnyKnews/0.1 (+https://github.com/trending)"
      },
      next: { revalidate: 0 }
    });

    if (!response.ok) {
      throw new Error(`GitHub Trending responded with ${response.status}`);
    }

    const $ = load(await response.text());
    const items: FetchedItem[] = [];

    $("article.Box-row").each((index, element) => {
      if (items.length >= SOURCE_FETCH_LIMIT) {
        return false;
      }

      const article = $(element);
      const titleLink = article.find("h2 a").first();
      const href = titleLink.attr("href");
      const title = normalizeText(titleLink.text()).replace(" / ", " / ");

      if (!href || !title) {
        return;
      }

      const summary = normalizeText(article.find("p").first().text());
      const starsText = normalizeText(
        article.find('a[href$="/stargazers"]').first().text()
      );
      const todayStars = normalizeText(
        article.find("span.d-inline-block.float-sm-right").first().text()
      );

      items.push({
        externalId: href.replace(/^\//, ""),
        metric: todayStars || starsText || `${index + 1}`,
        raw: { href, source: githubTrendingUrl },
        summary,
        title,
        url: new URL(href, "https://github.com").toString()
      });
    });

    if (!items.length) {
      throw new Error("GitHub Trending parser returned no items");
    }

    return items;
  }
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
