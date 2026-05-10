import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BoardSource } from "@/lib/board-service";
import type { CompactSourceCacheEntry } from "@/lib/source-cache-store";

async function main() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "anyknews-source-cache-"));
  const diskCachePath = path.join(tempDir, "source-cache.json");
  const previousDiskCachePath = process.env.ANYKNEWS_DISK_CACHE_PATH;
  const previousDisableDiskCache = process.env.ANYKNEWS_DISABLE_DISK_CACHE;

  process.env.ANYKNEWS_DISK_CACHE_PATH = diskCachePath;
  delete process.env.ANYKNEWS_DISABLE_DISK_CACHE;

  const { getSeedSourceData } = await import("@/lib/board-service");
  const {
    clearSourceCacheForTests,
    getBackoffUntil,
    getCompactBoardSource,
    getCompactSourceCache,
    loadSourceCacheFromDisk,
    persistSourceCacheToDisk,
    setCompactSourceCache,
    toCompactBoardSource
  } = await import("@/lib/source-cache-store");

  try {
    const source = getSeedSourceData("tech") ?? getSeedSourceData("ai");

    if (!source) {
      throw new Error("Expected a default seed source for cache verification.");
    }

    const sourceId = source.id;
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const updatedAt = Date.now();
    const lastSuccessAt = updatedAt - 1000;
    const backoffUntil = updatedAt + 5 * 60 * 1000;
    const sourceWithRaw = injectRawItem(source);
    const entry: CompactSourceCacheEntry = {
      sourceId,
      expiresAt,
      updatedAt,
      lastSuccessAt,
      backoffUntil,
      source: sourceWithRaw
    };

    clearSourceCacheForTests();
    setCompactSourceCache(entry);

    const compactBeforePersist = toCompactBoardSource(entry);
    if (!compactBeforePersist.items.length) {
      throw new Error("Expected toCompactBoardSource to return a source with items.");
    }

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

    if (restoredEntry.expiresAt !== expiresAt || restoredEntry.updatedAt !== updatedAt) {
      throw new Error(`Expected numeric timestamps to be restored for ${sourceId}.`);
    }

    if (restoredEntry.lastSuccessAt !== lastSuccessAt) {
      throw new Error(`Expected lastSuccessAt to be restored for ${sourceId}.`);
    }

    if (getBackoffUntil(sourceId) !== backoffUntil) {
      throw new Error(`Expected numeric backoffUntil to be restored for ${sourceId}.`);
    }

    if (!getCompactBoardSource(sourceId)?.items.length) {
      throw new Error("Expected getCompactBoardSource to return a source with items.");
    }

    if (restoredEntry.source.items.some((item) => "raw" in item)) {
      throw new Error("Compact source cache restored an item raw field.");
    }

    console.log(`Verified disk cache for ${sourceId}.`);
  } finally {
    clearSourceCacheForTests();
    restoreEnv("ANYKNEWS_DISK_CACHE_PATH", previousDiskCachePath);
    restoreEnv("ANYKNEWS_DISABLE_DISK_CACHE", previousDisableDiskCache);
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function injectRawItem(source: BoardSource): BoardSource {
  return {
    ...source,
    items: source.items.map((item, index) =>
      index === 0
        ? ({
            ...item,
            raw: { shouldNotPersist: true }
          } as BoardSource["items"][number])
        : item
    )
  };
}

function assertNoRawItems(payload: unknown) {
  if (!isRecord(payload) || payload.version !== 2 || !Array.isArray(payload.entries)) {
    throw new Error("Expected compact disk cache payload with versioned entries.");
  }

  for (const entry of payload.entries) {
    if (!isRecord(entry) || !isRecord(entry.source) || !Array.isArray(entry.source.items)) {
      throw new Error("Expected compact disk cache entry source items.");
    }

    for (const item of entry.source.items) {
      if (isRecord(item) && "raw" in item) {
        throw new Error("Compact disk cache persisted an item raw field.");
      }
    }
  }
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
