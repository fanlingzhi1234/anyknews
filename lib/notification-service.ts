import nodemailer from "nodemailer";
import { getBoardData, type BoardItem, type BoardPayload } from "@/lib/board-service";

export type DigestKind = "ai" | "github" | "weekly-github" | "zhihu" | "morning" | "all";
export type DigestChannel = "feishu" | "email";

type DigestSection = {
  items: BoardItem[];
  title: string;
  type: "ai" | "github" | "zhihu";
};

type ItemBrief = {
  intro: string;
  source: string;
  summary: string;
  tags: string[];
  title: string;
  url: string;
};

type DigestSectionPreview = {
  items: ItemBrief[];
  title: string;
};

export type SendDigestOptions = {
  channels?: DigestChannel[];
  digest?: DigestKind;
  dryRun?: boolean;
  includePreview?: boolean;
  refresh?: boolean;
};

export type SendDigestResult = {
  channels: Record<DigestChannel, "sent" | "skipped" | "error">;
  digest: DigestKind;
  errors: string[];
  itemCount: number;
  overview?: string[];
  preview?: DigestSectionPreview[];
  sectionCount: number;
};

export type NotificationHealth = {
  email: {
    configured: boolean;
    missing: string[];
    recipientCount: number;
    smtpHostConfigured: boolean;
  };
  feishu: {
    configured: boolean;
    missing: string[];
  };
  notificationTokenConfigured: boolean;
};

const defaultChannels: DigestChannel[] = ["feishu", "email"];
const aiSourceIds = ["ai", "aibase"];

export async function sendDigest(options: SendDigestOptions = {}): Promise<SendDigestResult> {
  const digest = options.digest ?? "ai";
  const channels = options.channels?.length ? options.channels : defaultChannels;
  const board = await getBoardData({ refresh: options.refresh === false ? "none" : "force" });
  const sections = buildDigestSections(board, digest);
  const overview = buildOverview(sections, digest);
  const errors: string[] = [];
  const channelStatus: SendDigestResult["channels"] = {
    email: "skipped",
    feishu: "skipped"
  };

  if (options.dryRun) {
    return {
      channels: channelStatus,
      digest,
      errors,
      itemCount: countItems(sections),
      overview,
      preview: options.includePreview ? buildPreview(sections) : undefined,
      sectionCount: sections.length
    };
  }

  if (channels.includes("feishu")) {
    try {
      await sendFeishuDigest(sections, digest, overview);
      channelStatus.feishu = "sent";
    } catch (error) {
      channelStatus.feishu = "error";
      errors.push(error instanceof Error ? error.message : "Feishu send failed");
    }
  }

  if (channels.includes("email")) {
    try {
      await sendEmailDigest(sections, digest, overview);
      channelStatus.email = "sent";
    } catch (error) {
      channelStatus.email = "error";
      errors.push(error instanceof Error ? error.message : "Email send failed");
    }
  }

  return {
    channels: channelStatus,
    digest,
    errors,
    itemCount: countItems(sections),
    overview,
    sectionCount: sections.length
  };
}

export function buildDigestSections(board: BoardPayload, digest: DigestKind): DigestSection[] {
  if (digest === "ai" || digest === "morning") {
    return buildAiSections(board, getLimit("AI_DIGEST_SOURCE_LIMIT", 4));
  }

  if (digest === "github" || digest === "weekly-github") {
    return [
      {
        title: "GitHub Trending Top10",
        type: "github",
        items: pickItems(board, ["tech"], 10)
      }
    ];
  }

  if (digest === "zhihu") {
    return [
      {
        title: "知乎热榜 Top10",
        type: "zhihu",
        items: pickItems(board, ["general"], 10)
      }
    ];
  }

  return [
    ...buildAiSections(board, getLimit("AI_DIGEST_SOURCE_LIMIT", 4)),
    {
      title: "知乎热榜 Top10",
      type: "zhihu",
      items: pickItems(board, ["general"], 10)
    }
  ];
}

export function getNotificationHealth(): NotificationHealth {
  const emailMissing = getMissingKeys(["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_TO"]);
  const feishuMissing = getMissingKeys(["FEISHU_WEBHOOK_URL"]);

  return {
    email: {
      configured: emailMissing.length === 0,
      missing: emailMissing,
      recipientCount: splitList(process.env.EMAIL_TO).length,
      smtpHostConfigured: Boolean(process.env.SMTP_HOST?.trim())
    },
    feishu: {
      configured: feishuMissing.length === 0,
      missing: feishuMissing
    },
    notificationTokenConfigured: Boolean(process.env.NOTIFICATION_API_TOKEN?.trim())
  };
}

async function sendFeishuDigest(
  sections: DigestSection[],
  digest: DigestKind,
  overview: string[]
) {
  const webhookUrl = process.env.FEISHU_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    throw new Error("FEISHU_WEBHOOK_URL is not configured.");
  }

  const text = formatPlainText(sections, digest, overview, {
    limitPerSection: digest === "ai" || digest === "morning"
      ? getLimit("AI_DIGEST_FEISHU_SOURCE_LIMIT", 3)
      : 10
  });
  const response = await fetch(webhookUrl, {
    body: JSON.stringify({
      content: {
        text
      },
      msg_type: "text"
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Feishu webhook responded with ${response.status}`);
  }
}

async function sendEmailDigest(
  sections: DigestSection[],
  digest: DigestKind,
  overview: string[]
) {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const to = splitList(process.env.EMAIL_TO);

  if (!host || !user || !pass || !to.length) {
    throw new Error("SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_TO must be configured.");
  }

  const port = Number.parseInt(process.env.SMTP_PORT ?? "465", 10);
  const secure = (process.env.SMTP_SECURE ?? "true").toLowerCase() !== "false";
  const transporter = nodemailer.createTransport({
    auth: {
      pass,
      user
    },
    host,
    port,
    secure
  });
  const subject = `AnyKnews ${getDigestTitle(digest)} ${formatDateForSubject()}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM?.trim() || user,
    html: formatHtml(sections, digest, overview),
    subject,
    text: formatPlainText(sections, digest, overview, { limitPerSection: 50 }),
    to
  });
}

function buildAiSections(board: BoardPayload, limitPerSource: number): DigestSection[] {
  return board.sources
    .filter((source) => aiSourceIds.includes(source.id))
    .map((source) => {
      const items = pickPreviousDayFromItems(source.items, limitPerSource);

      return {
        title: `${source.name} Top ${items.length}`,
        type: "ai" as const,
        items
      };
    })
    .filter((section) => section.items.length > 0);
}

function pickItems(board: BoardPayload, sourceIds: string[], limit: number) {
  return board.sources
    .filter((source) => sourceIds.includes(source.id))
    .flatMap((source) => source.items)
    .slice(0, limit);
}

function pickPreviousDayFromItems(items: BoardItem[], limit: number) {
  const previousDateKey = getPreviousShanghaiDateKey();
  const datedItems = items.filter(
    (item) => item.publishedAt && getShanghaiDateKey(new Date(item.publishedAt)) === previousDateKey
  );

  return (datedItems.length ? datedItems : items).slice(0, limit);
}

function formatPlainText(
  sections: DigestSection[],
  digest: DigestKind,
  overview: string[],
  options: {
    limitPerSection: number;
  }
) {
  const heading = `${getDigestHeader(digest)}｜${formatDateForSubject()}｜共 ${countItems(sections)} 条`;
  const overviewBlock = overview.length
    ? ["今日速览", ...overview.map((line) => `- ${line}`)].join("\n")
    : "";
  const body = sections
    .map((section) => {
      const lines = section.items.slice(0, options.limitPerSection).map((item, index) => {
        const brief = buildItemBrief(item, section.type);
        const summaryLabel = section.type === "github" ? "简介" : "摘要";
        const introLabel = section.type === "github" ? "看点" : "看点";
        const tags = brief.tags.length ? `\n   标签：${brief.tags.join(" / ")}` : "";

        return [
          `${index + 1}. ${brief.title}`,
          `   ${summaryLabel}：${brief.summary}`,
          `   ${introLabel}：${brief.intro}`,
          tags ? tags.trimStart() : "",
          `   链接：${brief.url}`
        ].filter(Boolean).join("\n");
      });

      return [`【${section.title}】`, ...lines].join("\n");
    })
    .join("\n\n");

  return [heading, overviewBlock, body].filter(Boolean).join("\n\n");
}

function formatHtml(sections: DigestSection[], digest: DigestKind, overview: string[]) {
  const body = sections
    .map((section) => {
      const items = section.items
        .map((item, index) => {
          const brief = buildItemBrief(item, section.type);
          const tags = brief.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");

          return `
            <li>
              <a class="title" href="${escapeHtml(brief.url)}">${index + 1}. ${escapeHtml(brief.title)}</a>
              <div class="source">${escapeHtml(brief.source)}</div>
              <p><strong>${section.type === "github" ? "简介" : "摘要"}：</strong>${escapeHtml(brief.summary)}</p>
              <p><strong>看点：</strong>${escapeHtml(brief.intro)}</p>
              ${tags ? `<div class="tags">${tags}</div>` : ""}
            </li>`;
        })
        .join("");

      return `<section><h2>${escapeHtml(section.title)}</h2><ol>${items}</ol></section>`;
    })
    .join("");
  const overviewItems = overview.map((line) => `<li>${escapeHtml(line)}</li>`).join("");

  return `
    <!doctype html>
    <html>
      <body style="margin:0;background:#f6f7f9;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;">
        <main style="max-width:760px;margin:0 auto;padding:28px 18px;">
          <h1 style="margin:0 0 6px;font-size:24px;">${escapeHtml(getDigestHeader(digest))}</h1>
          <p style="margin:0 0 22px;color:#64748b;">${escapeHtml(formatDateForSubject())} · 共 ${countItems(sections)} 条</p>
          ${overview.length ? `<section style="padding:16px 18px;margin-bottom:18px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;"><h2 style="margin:0 0 8px;font-size:17px;">今日速览</h2><ul style="margin:0;padding-left:20px;">${overviewItems}</ul></section>` : ""}
          <style>
            section.digest-section { padding: 16px 18px; margin-bottom: 18px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
            section.digest-section h2 { margin: 0 0 10px; font-size: 18px; }
            section.digest-section ol { margin: 0; padding-left: 20px; }
            section.digest-section li { margin: 0 0 16px; }
            a.title { color: #111827; font-weight: 700; text-decoration: none; }
            .source { margin-top: 2px; color: #64748b; font-size: 12px; }
            p { margin: 6px 0; }
            .tags span { display: inline-block; margin: 3px 6px 0 0; padding: 2px 7px; border-radius: 99px; background: #eef2ff; color: #3730a3; font-size: 12px; }
          </style>
          ${body.replaceAll("<section>", "<section class=\"digest-section\">")}
        </main>
      </body>
    </html>`;
}

function buildOverview(sections: DigestSection[], digest: DigestKind) {
  if (digest === "github" || digest === "weekly-github") {
    return [
      "本周 GitHub Trending 以全站热度排序，适合快速筛选值得跟进的新项目。",
      "优先关注简介清晰、增长快、与 AI/开发工具/基础设施相关的仓库。"
    ];
  }

  const briefs = sections.flatMap((section) =>
    section.items.map((item) => buildItemBrief(item, section.type))
  );
  const tagSet = new Set(briefs.flatMap((brief) => brief.tags));
  const lines: string[] = [];

  if (tagSet.has("Agent") || tagSet.has("项目管理")) {
    lines.push("Agent 工具链继续向研发、协作和项目管理流程渗透。");
  }

  if (tagSet.has("机器人")) {
    lines.push("机器人与具身智能内容值得关注真实场景、数据闭环和量产节奏。");
  }

  if (tagSet.has("模型") || tagSet.has("开源")) {
    lines.push("模型、推理和开源基础设施仍在推动应用成本下降。");
  }

  if (tagSet.has("多模态") || tagSet.has("办公")) {
    lines.push("多模态能力正在和办公、文档、表格、浏览器等入口结合。");
  }

  return lines.length
    ? lines.slice(0, 3)
    : briefs.slice(0, 3).map((brief) => `${brief.source}：${brief.title}`);
}

function buildItemBrief(item: BoardItem, sectionType: DigestSection["type"]): ItemBrief {
  const summary = cleanSummary(item.summary, item.title, sectionType);
  const tags = getTags(`${item.title} ${summary}`);

  return {
    intro: getIntro(`${item.title} ${summary}`, tags, sectionType),
    source: item.sourceName,
    summary,
    tags,
    title: item.title,
    url: item.originalUrl
  };
}

function cleanSummary(summary: string, title: string, sectionType: DigestSection["type"]) {
  const normalized = normalizeText(summary).replace(normalizeText(title), "").trim();

  if (normalized) {
    return truncate(normalized, sectionType === "github" ? 180 : 130);
  }

  if (sectionType === "github") {
    return "项目简介暂缺，建议根据仓库名称和热度判断是否点开查看。";
  }

  return "原文未提供稳定摘要，建议结合标题判断是否继续阅读。";
}

function getIntro(text: string, tags: string[], sectionType: DigestSection["type"]) {
  if (sectionType === "github") {
    if (tags.includes("Agent") || tags.includes("开发工具")) {
      return "适合关注开发效率、代码智能体或工程自动化的人快速扫一眼。";
    }

    if (tags.includes("模型") || tags.includes("开源")) {
      return "偏技术基础设施，可观察是否值得纳入后续工具链。";
    }

    return "用热度做第一层筛选，适合每周集中判断是否收藏或试用。";
  }

  if (tags.includes("Agent") || tags.includes("项目管理")) {
    return "关注 AI 从单点能力进入团队协作、研发流程和任务编排的落地价值。";
  }

  if (tags.includes("机器人")) {
    return "重点看真实场景、量产节奏、数据闭环和成本约束是否有新进展。";
  }

  if (tags.includes("多模态") || tags.includes("办公")) {
    return "适合关注多模态能力如何进入文档、表格、会议和浏览器等日常入口。";
  }

  if (tags.includes("模型") || tags.includes("开源")) {
    return "偏基础能力和工具生态，可能影响后续应用开发成本与选型。";
  }

  if (/融资|发布|上线|开源|升级|模型|工具|框架/.test(text)) {
    return "这类发布型信息适合判断技术趋势和产品节奏是否出现变化。";
  }

  return "可作为今日 AI 行业动态的补充信息，按需点开原文细看。";
}

function getTags(text: string) {
  const rules: Array<[string, RegExp]> = [
    ["Agent", /agent|智能体|浏览器\s*Agent|工作流/i],
    ["项目管理", /项目管理|协作|任务|排期|研发流程|工作流/i],
    ["机器人", /机器人|具身|人形|自动驾驶|机器马/i],
    ["多模态", /多模态|视频|图像|语音|视觉/i],
    ["办公", /办公|文档|表格|会议|Office|浏览器/i],
    ["模型", /大模型|模型|推理|上下文|token/i],
    ["开源", /开源|GitHub|框架|仓库/i],
    ["开发工具", /代码|编程|CLI|devtool|developer|coding/i]
  ];
  const tags = rules
    .filter(([, pattern]) => pattern.test(text))
    .map(([tag]) => tag);

  return [...new Set(tags)].slice(0, 3);
}

function getDigestHeader(digest: DigestKind) {
  if (digest === "github" || digest === "weekly-github") {
    return "AnyKnews GitHub 周报";
  }

  if (digest === "zhihu") {
    return "AnyKnews 知乎热榜";
  }

  if (digest === "all") {
    return "AnyKnews 综合简报";
  }

  return "AnyKnews AI 早报";
}

function getDigestTitle(digest: DigestKind) {
  if (digest === "github" || digest === "weekly-github") {
    return "GitHub 周报";
  }

  if (digest === "zhihu") {
    return "知乎热榜";
  }

  if (digest === "all") {
    return "综合简报";
  }

  return "AI 早报";
}

function countItems(sections: DigestSection[]) {
  return sections.reduce((count, section) => count + section.items.length, 0);
}

function getLimit(key: string, fallback: number) {
  const value = Number.parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function splitList(value?: string) {
  return (value ?? "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPreview(sections: DigestSection[]): DigestSectionPreview[] {
  return sections.map((section) => ({
    title: section.title,
    items: section.items.map((item) => buildItemBrief(item, section.type))
  }));
}

function getMissingKeys(keys: string[]) {
  return keys.filter((key) => !process.env[key]?.trim());
}

function formatDateForSubject() {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai"
  }).format(new Date());
}

function getPreviousShanghaiDateKey() {
  return getShanghaiDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

function getShanghaiDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  }).format(date);
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
