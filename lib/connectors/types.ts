export type FetchedItem = {
  externalId: string;
  metric?: string;
  publishedAt?: string;
  raw?: unknown;
  summary?: string;
  title: string;
  url: string;
};

export type SourceConnector = {
  fetchItems: () => Promise<FetchedItem[]>;
  id: string;
  label: string;
};

