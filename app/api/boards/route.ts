import { NextResponse } from "next/server";
import { getBoardData, type RefreshMode } from "@/lib/board-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refreshParam = url.searchParams.get("refresh");
  const refresh: RefreshMode = refreshParam === "force" ? "force" : "stale";

  return NextResponse.json(await getBoardData({ refresh }));
}
