import { NextResponse } from "next/server";
import { getSourceItemsPage, type RefreshMode } from "@/lib/board-service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    sourceId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { sourceId } = await context.params;
  const url = new URL(request.url);
  const page = parsePositiveInteger(url.searchParams.get("page"));
  const pageSize = parsePositiveInteger(url.searchParams.get("pageSize"));
  const refresh = parseRefreshMode(url.searchParams.get("refresh"));
  const payload = await getSourceItemsPage(sourceId, {
    page,
    pageSize,
    refresh
  });

  if (!payload) {
    return NextResponse.json(
      { error: "SOURCE_NOT_FOUND", message: `Source ${sourceId} was not found.` },
      { status: 404 }
    );
  }

  return NextResponse.json(payload);
}

function parsePositiveInteger(value: string | null) {
  const parsedValue = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
}

function parseRefreshMode(value: string | null): RefreshMode {
  if (value === "force" || value === "stale" || value === "none") {
    return value;
  }

  return "none";
}
