import { NextResponse } from "next/server";
import { getItemById } from "@/lib/board-service";

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { itemId } = await context.params;
  const item = await getItemById(itemId);

  if (!item) {
    return NextResponse.redirect(new URL("/", _request.url));
  }

  return NextResponse.redirect(item.originalUrl);
}
