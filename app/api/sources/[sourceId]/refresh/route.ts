import { NextResponse } from "next/server";
import { getSourceData, refreshSource } from "@/lib/board-service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    sourceId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { sourceId } = await context.params;
  const source = await getSourceData(sourceId);

  if (!source) {
    return NextResponse.json(
      { error: "SOURCE_NOT_FOUND", message: `Source ${sourceId} was not found.` },
      { status: 404 }
    );
  }

  const refreshResult = await refreshSource(sourceId, { force: true });
  const refreshedSource = (await getSourceData(sourceId)) ?? source;

  return NextResponse.json({
    status: refreshResult.status,
    error: refreshResult.error,
    fetchRunId: refreshResult.fetchRunId ?? null,
    itemsFound: refreshResult.itemsFound,
    itemsSaved: refreshResult.itemsSaved,
    refreshedAt: new Date().toISOString(),
    source: refreshedSource
  });
}
