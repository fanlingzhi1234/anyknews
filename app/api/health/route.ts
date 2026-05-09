import { NextResponse } from "next/server";
import { getBoardData } from "@/lib/board-service";
import { getNotificationHealth } from "@/lib/notification-service";
import { listCompactSourceCache, loadSourceCacheFromDisk } from "@/lib/source-cache-store";

export const dynamic = "force-dynamic";

export async function GET() {
  await loadSourceCacheFromDisk();
  const board = await getBoardData({ refresh: "none" });
  const notification = getNotificationHealth();
  const compactCacheEntries = listCompactSourceCache();
  const now = Date.now();
  const unavailableSources = board.sources
    .filter((source) => source.status === "error")
    .map((source) => ({
      error: source.diagnostic.errorMessage,
      id: source.id,
      name: source.name
    }));
  const sourceDetails = board.sources.map((source) => ({
    cacheExpiresAt: source.diagnostic.cacheExpiresAt,
    category: source.category,
    error: source.diagnostic.errorMessage,
    id: source.id,
    itemCount: source.items.length,
    mode: source.diagnostic.mode,
    name: source.name,
    status: source.status,
    updatedAt: source.updatedAt
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    notification,
    runtime: {
      cache: {
        backoffEntries: compactCacheEntries.filter(
          (entry) => entry.backoffUntil !== undefined && entry.backoffUntil > now
        ).length,
        diskEntries: compactCacheEntries.length
      },
      cacheMode: "memory",
      timezone: process.env.TZ || "Asia/Shanghai"
    },
    sources: {
      itemCount: board.itemCount,
      details: sourceDetails,
      sourceCount: board.sourceCount,
      unavailable: unavailableSources,
      unavailableCount: unavailableSources.length
    },
    status: "ok"
  });
}
