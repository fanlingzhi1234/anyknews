import { ensureItems, fetchText, parseRssItems } from "@/lib/connectors/shared";
import type { SourceConnector } from "@/lib/connectors/types";

const qbitaiFeedUrl = "https://www.qbitai.com/feed";

export const qbitaiConnector: SourceConnector = {
  id: "ai",
  label: "QbitAI RSS",
  async fetchItems() {
    const xml = await fetchText(qbitaiFeedUrl);
    return ensureItems(parseRssItems(xml, qbitaiFeedUrl), this.label);
  }
};

