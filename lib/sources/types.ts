import type { FetchedItem } from "@/lib/connectors/types";

export type NewsCategory =
  | "AI资讯"
  | "技术"
  | "广义资讯"
  | "科技资讯"
  | "娱乐"
  | "金融"
  | "汽车";

export type SourceFetchCost = "low" | "medium" | "high";
export type SourceRefreshPolicy = "auto" | "budgeted" | "manual";
export type SourceCatalogStatus = "live" | "catalog-only";
export type SourceDisplayType = "ranked" | "bullets" | "rank" | "timeline" | "article";
export type SourceColor =
  | "blue"
  | "cyan"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "slate"
  | "red"
  | "green"
  | "teal";

export type SourceSeedItem = {
  title: string;
  metric?: string;
  summary?: string;
  url?: string;
};

export type SourceConnectorRecipe =
  | { kind: "custom" }
  | { kind: "rss"; url: string }
  | { kind: "rsshub"; routes: string[] }
  | { kind: "dailyhot"; endpoint: string }
  | { kind: "sixty-seconds"; endpoint: string }
  | {
      kind: "html-list";
      url: string;
      baseUrl: string;
      hrefIncludes: string[];
      minTitleLength?: number;
    }
  | {
      kind: "json-list";
      url: string;
      mapItems: (payload: unknown) => FetchedItem[];
    };

export type SourceManifest = {
  id: string;
  name: string;
  board: string;
  category: NewsCategory;
  tone: "ai" | "tech" | "news" | "biz" | "ent" | "fin" | "car";
  logo: string;
  color: SourceColor;
  displayType: SourceDisplayType;
  footer: string;
  homeUrl: string;
  priority: number;
  defaultSubscribed: boolean;
  fetchCost: SourceFetchCost;
  refreshPolicy: SourceRefreshPolicy;
  catalogStatus: SourceCatalogStatus;
  seedItems: SourceSeedItem[];
  connector: SourceConnectorRecipe;
};

export type CategoryManifest = {
  label: NewsCategory;
  anchor: "ai" | "tech" | "general" | "biz" | "ent" | "finance" | "auto";
};
