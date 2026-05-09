import {
  decideSourceRefresh,
  getMediumHighFreshnessThresholdMs,
  type RefreshDecision,
  type RefreshIntent,
  type RefreshState
} from "@/lib/source-refresh-planner";
import type { SourceManifest } from "@/lib/sources/types";

const now = 1_800_000;
const fiveMinutes = 5 * 60 * 1000;
const elevenMinutes = 11 * 60 * 1000;

const lowSource = createSource({ fetchCost: "low" });
const mediumSource = createSource({ fetchCost: "medium" });
const highSource = createSource({ fetchCost: "high" });
const catalogOnlySource = createSource({ catalogStatus: "catalog-only" });

expectDecision(
  "low stale page-open refreshes",
  lowSource,
  "page-open",
  state({ isCacheFresh: false }),
  { shouldFetch: true, reason: "low-cost-stale" }
);

expectDecision(
  "low fresh page-open skips",
  lowSource,
  "page-open",
  state({ isCacheFresh: true }),
  { shouldFetch: false, reason: "cache-fresh" }
);

expectDecision(
  "medium within 5 min skips",
  mediumSource,
  "page-open",
  state({ isCacheFresh: false, lastSuccessAt: now - fiveMinutes }),
  { shouldFetch: false, reason: "budget-threshold-fresh" }
);

for (const source of [mediumSource, highSource]) {
  expectDecision(
    `${source.fetchCost} after 11 min fetches`,
    source,
    "page-open",
    state({ isCacheFresh: true, lastSuccessAt: now - elevenMinutes }),
    { shouldFetch: true, reason: "budget-threshold-expired" }
  );
}

for (const source of [mediumSource, highSource]) {
  expectDecision(
    `${source.fetchCost} missing lastSuccessAt fetches`,
    source,
    "page-open",
    state({ isCacheFresh: true }),
    { shouldFetch: true, reason: "budget-threshold-expired" }
  );
}

expectDecision(
  "backoff blocks page-open",
  lowSource,
  "page-open",
  state({ isCacheFresh: false, backoffUntil: now + 1 }),
  { shouldFetch: false, reason: "backoff" }
);

expectDecision(
  "manual bypasses backoff",
  lowSource,
  "manual",
  state({ isCacheFresh: false, backoffUntil: now + getMediumHighFreshnessThresholdMs() }),
  { shouldFetch: true, reason: "manual" }
);

expectDecision(
  "catalog-only skips",
  catalogOnlySource,
  "force",
  state({ isCacheFresh: false }),
  { shouldFetch: false, reason: "catalog-only" }
);

expectDecision(
  "no connector skips",
  lowSource,
  "force",
  state({ hasConnector: false, isCacheFresh: false }),
  { shouldFetch: false, reason: "no-connector" }
);

expectDecision(
  "pagination fresh skips",
  lowSource,
  "pagination",
  state({ isCacheFresh: true }),
  { shouldFetch: false, reason: "cache-fresh" }
);

expectDecision(
  "pagination stale fetches",
  lowSource,
  "pagination",
  state({ isCacheFresh: false }),
  { shouldFetch: true, reason: "pagination-miss" }
);

console.log("Verified refresh policy rules.");

function expectDecision(
  label: string,
  source: SourceManifest,
  intent: RefreshIntent,
  refreshState: RefreshState,
  expected: RefreshDecision
) {
  const actual = decideSourceRefresh(source, intent, refreshState);

  if (actual.shouldFetch !== expected.shouldFetch || actual.reason !== expected.reason) {
    throw new Error(
      `${label}: expected ${formatDecision(expected)}, got ${formatDecision(actual)}`
    );
  }
}

function state(overrides: Partial<RefreshState>): RefreshState {
  return {
    hasConnector: true,
    isCacheFresh: false,
    now,
    ...overrides
  };
}

function createSource(overrides: Partial<SourceManifest>): SourceManifest {
  return {
    id: "test-source",
    name: "Test Source",
    board: "Test Board",
    category: "技术",
    tone: "tech",
    logo: "T",
    color: "blue",
    displayType: "bullets",
    footer: "Test",
    homeUrl: "https://example.com",
    priority: 1,
    defaultSubscribed: false,
    fetchCost: "low",
    refreshPolicy: "auto",
    catalogStatus: "live",
    seedItems: [{ title: "Seed item" }],
    connector: { kind: "custom" },
    ...overrides
  };
}

function formatDecision(decision: RefreshDecision) {
  return `${decision.shouldFetch ? "fetch" : "skip"}:${decision.reason}`;
}
