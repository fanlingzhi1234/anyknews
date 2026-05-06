import { ensureItems, extractLinksFromHtml, fetchText } from "@/lib/connectors/shared";
import type { SourceConnector } from "@/lib/connectors/types";

const caixinUrl = "https://www.caixin.com";

export const caixinConnector: SourceConnector = {
  id: "caixin",
  label: "Caixin Home",
  async fetchItems() {
    const html = await fetchText(caixinUrl);
    return ensureItems(
      extractLinksFromHtml(html, {
        baseUrl: caixinUrl,
        hrefIncludes: [".html"],
        minTitleLength: 8
      }),
      this.label
    );
  }
};

