import type { SourceManifest } from "@/lib/sources/types";

export type RefreshIntent = "page-open" | "manual" | "pagination" | "force";

export type RefreshState = {
  hasConnector: boolean;
  isCacheFresh: boolean;
  lastSuccessAt?: number;
  backoffUntil?: number;
  now: number;
};

export type RefreshDecisionReason =
  | "force"
  | "manual"
  | "pagination-miss"
  | "low-cost-stale"
  | "budget-threshold-expired"
  | "catalog-only"
  | "no-connector"
  | "cache-fresh"
  | "budget-threshold-fresh"
  | "backoff";

export type RefreshDecision = {
  shouldFetch: boolean;
  reason: RefreshDecisionReason;
};

export const MEDIUM_HIGH_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

export function getMediumHighFreshnessThresholdMs() {
  return MEDIUM_HIGH_REFRESH_THRESHOLD_MS;
}

export function decideSourceRefresh(
  source: SourceManifest,
  intent: RefreshIntent,
  state: RefreshState
): RefreshDecision {
  if (source.catalogStatus === "catalog-only") {
    return skip("catalog-only");
  }

  if (!state.hasConnector) {
    return skip("no-connector");
  }

  if (intent === "force") {
    return fetch("force");
  }

  if (intent === "manual") {
    return fetch("manual");
  }

  if (state.backoffUntil !== undefined && state.backoffUntil > state.now) {
    return skip("backoff");
  }

  if (intent === "pagination") {
    return state.isCacheFresh ? skip("cache-fresh") : fetch("pagination-miss");
  }

  if (source.fetchCost === "low") {
    return state.isCacheFresh ? skip("cache-fresh") : fetch("low-cost-stale");
  }

  if (isBudgetThresholdFresh(state)) {
    return skip("budget-threshold-fresh");
  }

  return fetch("budget-threshold-expired");
}

function isBudgetThresholdFresh(state: RefreshState) {
  return (
    state.lastSuccessAt !== undefined &&
    state.now - state.lastSuccessAt <= MEDIUM_HIGH_REFRESH_THRESHOLD_MS
  );
}

function fetch(reason: RefreshDecisionReason): RefreshDecision {
  return { shouldFetch: true, reason };
}

function skip(reason: RefreshDecisionReason): RefreshDecision {
  return { shouldFetch: false, reason };
}
