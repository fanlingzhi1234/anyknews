import {
  ensureItems,
  extractLinksFromHtml,
  fetchJson,
  fetchText,
  getPublicRssHubRoutes,
  parseRssItems,
  SOURCE_FETCH_LIMIT
} from "@/lib/connectors/shared";
import { fetchDailyHotItems } from "@/lib/connectors/dailyhot";
import type { SourceConnector } from "@/lib/connectors/types";
import type { SourceManifest } from "@/lib/sources/types";

export function buildConnectorFromRecipe(source: SourceManifest): SourceConnector | undefined {
  if (source.catalogStatus === "catalog-only" || source.connector.kind === "custom") {
    return undefined;
  }

  return {
    id: source.id,
    label: source.name,
    async fetchItems() {
      const recipe = source.connector;

      switch (recipe.kind) {
        case "rss": {
          const xml = await fetchText(recipe.url);
          return ensureItems(parseRssItems(xml, recipe.url), this.label);
        }

        case "rsshub":
          return fetchRssHubItems(recipe.routes, this.label);

        case "dailyhot":
          return fetchDailyHotItems(recipe.endpoint, this.label);

        case "html-list": {
          const html = await fetchText(recipe.url);
          return ensureItems(
            extractLinksFromHtml(html, {
              baseUrl: recipe.baseUrl,
              hrefIncludes: recipe.hrefIncludes,
              limit: SOURCE_FETCH_LIMIT,
              minTitleLength: recipe.minTitleLength
            }),
            this.label
          );
        }

        case "json-list": {
          const payload = await fetchJson<unknown>(recipe.url);
          return ensureItems(recipe.mapItems(payload).slice(0, SOURCE_FETCH_LIMIT), this.label);
        }

        case "custom":
          return [];
      }
    }
  };
}

async function fetchRssHubItems(routes: string[], label: string) {
  let lastError: unknown;

  for (const route of routes) {
    const urls = getPublicRssHubRoutes(route);

    if (!urls.length) {
      lastError = new Error(`${label} has no public RSSHub routes configured for ${route}`);
      continue;
    }

    for (const url of urls) {
      try {
        const xml = await fetchText(url);
        return ensureItems(parseRssItems(xml, url), label);
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`${label} RSSHub connector exhausted all routes`);
}
