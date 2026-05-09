import { NextResponse } from "next/server";
import { getBoardData, validateRequestedSourceIds, type RefreshMode } from "@/lib/board-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refreshParam = url.searchParams.get("refresh");
  const refresh: RefreshMode =
    refreshParam === "force" ? "force" : refreshParam === "none" ? "none" : "stale";
  const hasSourceIdsParam = url.searchParams.has("sourceIds");
  const requestedSourceIds = parseSourceIds(url.searchParams.get("sourceIds"));
  const sourceIds = hasSourceIdsParam ? validateRequestedSourceIds(requestedSourceIds ?? []) : undefined;
  const itemLimit = parseItemLimit(url.searchParams.get("itemLimit"));
  const includeCatalog = parseBoolean(url.searchParams.get("includeCatalog"));

  if (hasSourceIdsParam && requestedSourceIds?.length === 0) {
    return NextResponse.json({ error: "No valid sourceIds provided" }, { status: 400 });
  }

  if (hasSourceIdsParam && sourceIds?.length === 0) {
    return NextResponse.json({ error: "No valid sourceIds provided" }, { status: 400 });
  }

  // Source manager views should request includeCatalog=true; the board defaults to subscribed sources.
  return NextResponse.json(await getBoardData({ includeCatalog, itemLimit, refresh, sourceIds }));
}

function parseSourceIds(value: string | null) {
  return value
    ?.split(",")
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);
}

function parseItemLimit(value: string | null) {
  if (!value) {
    return undefined;
  }

  const itemLimit = Number.parseInt(value, 10);

  return Number.isFinite(itemLimit) && itemLimit > 0 ? itemLimit : undefined;
}

function parseBoolean(value: string | null) {
  return value === "true" || value === "1";
}
