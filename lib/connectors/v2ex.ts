import { SOURCE_FETCH_LIMIT } from "@/lib/connectors/shared";
import { fetchDailyHotItems } from "@/lib/connectors/dailyhot";
import type { SourceConnector } from "@/lib/connectors/types";

const v2exHotUrl = "https://www.v2ex.com/api/topics/hot.json";

type V2exTopic = {
  content?: string;
  created?: number;
  id: number;
  member?: {
    username?: string;
  };
  node?: {
    title?: string;
  };
  replies?: number;
  title: string;
  url: string;
};

export const v2exConnector: SourceConnector = {
  id: "v2ex",
  label: "V2EX Hot Topics",
  async fetchItems() {
    try {
      const response = await fetch(v2exHotUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "AnyKnews/0.1 (+https://www.v2ex.com)"
        },
        next: { revalidate: 0 }
      });

      if (!response.ok) {
        throw new Error(`V2EX hot topics responded with ${response.status}`);
      }

      const topics = (await response.json()) as V2exTopic[];

      return topics.slice(0, SOURCE_FETCH_LIMIT).map((topic) => ({
        externalId: String(topic.id),
        metric: String(topic.replies ?? 0),
        publishedAt: topic.created
          ? new Date(topic.created * 1000).toISOString()
          : undefined,
        raw: {
          member: topic.member?.username,
          node: topic.node?.title
        },
        summary: [topic.node?.title, topic.member?.username].filter(Boolean).join(" · "),
        title: topic.title,
        url: topic.url
      }));
    } catch {
      return fetchDailyHotItems("v2ex", `${this.label} DailyHot`);
    }
  }
};
