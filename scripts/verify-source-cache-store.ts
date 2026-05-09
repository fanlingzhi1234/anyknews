import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getSeedSourceData } from "@/lib/board-service";
import type { CompactSourceCacheEntry } from "@/lib/source-cache-store";

async function main() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "anyknews-source-cache-"));
  const diskCachePath = path.join(tempDir, "source-cache.json");

  process.env.ANYKNEWS_DISK_CACHE_PATH = diskCachePath;
  delete process.env.ANYKNEWS_DISABLE_DISK_CACHE;

  const {
    clearSourceCacheForTests,
    getBackoffUntil,
    getCompactSourceCache,
    loadSourceCacheFromDisk,
    persistSourceCacheToDisk,
    setCompactSourceCache
  } = await import("@/lib/source-cache-store");

  try {
    const source = getSeedSourceData("tech") ?? getSeedSourceData("ai");

    if (!source) {
      throw new Error("Expected a default seed source for cache verification.");
    }

    const sourceId = source.id;
    const sourceMetadata = {
      id: source.id,
      category: source.category,
      categoryKey: source.categoryKey,
      diagnostic: source.diagnostic,
      logo: source.logo,
      tone: source.tone,
      name: source.name,
      board: source.board,
      color: source.color,
      defaultSubscribed: source.defaultSubscribed,
      displayType: source.displayType,
      footer: source.footer,
      homeUrl: source.homeUrl,
      priority: source.priority,
      status: source.status,
      updatedAt: source.updatedAt
    };
    const lastSuccessAt = new Date("2026-05-09T08:00:00.000Z").toISOString();
    const backoffUntil = new Date("2026-05-09T08:05:00.000Z").toISOString();
    const entry: CompactSourceCacheEntry = {
      sourceId,
      source: sourceMetadata,
      items: source.items.map((item) => ({
        ...item,
        raw: { shouldNotPersist: true }
      })) as CompactSourceCacheEntry["items"],
      cachedAt: new Date("2026-05-09T08:01:00.000Z").toISOString(),
      expiresAt: new Date("2026-05-09T08:10:00.000Z").toISOString(),
      lastSuccessAt,
      backoffUntil
    };

    clearSourceCacheForTests();
    setCompactSourceCache(entry);
    await persistSourceCacheToDisk();

    const diskPayload = JSON.parse(await readFile(diskCachePath, "utf8")) as unknown;
    assertNoRawItems(diskPayload);

    clearSourceCacheForTests();
    if (getCompactSourceCache(sourceId)) {
      throw new Error("Expected in-memory source cache to be empty after clearing.");
    }

    await loadSourceCacheFromDisk();

    const restoredEntry = getCompactSourceCache(sourceId);
    if (!restoredEntry) {
      throw new Error(`Expected ${sourceId} to be restored from disk.`);
    }

    if (restoredEntry.lastSuccessAt !== lastSuccessAt) {
      throw new Error(`Expected lastSuccessAt to be restored for ${sourceId}.`);
    }

    if (getBackoffUntil(sourceId) !== backoffUntil) {
      throw new Error(`Expected backoffUntil to be restored for ${sourceId}.`);
    }

    if (restoredEntry.items.some((item) => "raw" in item)) {
      throw new Error("Compact source cache restored an item raw field.");
    }

    console.log(`Verified disk cache for ${sourceId}.`);
  } finally {
    clearSourceCacheForTests();
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function assertNoRawItems(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.entries)) {
    throw new Error("Expected compact disk cache payload with entries.");
  }

  for (const entry of payload.entries) {
    if (!isRecord(entry) || !Array.isArray(entry.items)) {
      throw new Error("Expected compact disk cache entry items.");
    }

    for (const item of entry.items) {
      if (isRecord(item) && "raw" in item) {
        throw new Error("Compact disk cache persisted an item raw field.");
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
