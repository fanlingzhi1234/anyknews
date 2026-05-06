import { NextResponse } from "next/server";
import { sendDigest, type DigestChannel, type DigestKind } from "@/lib/notification-service";

export const dynamic = "force-dynamic";

type DigestRequestBody = {
  channels?: DigestChannel[];
  digest?: DigestKind;
  dryRun?: boolean;
  includePreview?: boolean;
  refresh?: boolean;
};

const digestKinds = new Set<DigestKind>([
  "ai",
  "github",
  "weekly-github",
  "zhihu",
  "morning",
  "all"
]);
const digestChannels = new Set<DigestChannel>(["feishu", "email"]);

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Invalid notification token." },
      { status: 401 }
    );
  }

  const body = await readBody(request);
  const digest = digestKinds.has(body.digest ?? "ai") ? body.digest ?? "ai" : "ai";
  const channels = (body.channels ?? ["feishu", "email"]).filter((channel) =>
    digestChannels.has(channel)
  );
  const result = await sendDigest({
    channels,
    digest,
    dryRun: body.dryRun,
    includePreview: body.includePreview,
    refresh: body.refresh
  });
  const hasError = result.errors.length > 0;

  return NextResponse.json(result, { status: hasError ? 207 : 200 });
}

async function readBody(request: Request): Promise<DigestRequestBody> {
  try {
    return (await request.json()) as DigestRequestBody;
  } catch {
    return {};
  }
}

function isAuthorized(request: Request) {
  const token = process.env.NOTIFICATION_API_TOKEN?.trim();

  if (!token) {
    return true;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const headerToken = request.headers.get("x-anyknews-token") ?? "";

  return bearer === token || headerToken === token;
}
