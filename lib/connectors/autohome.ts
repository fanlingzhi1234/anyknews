import {
  ensureItems,
  extractLinksFromHtml,
  fetchText,
  normalizeText,
  SOURCE_FETCH_LIMIT
} from "@/lib/connectors/shared";
import type { SourceConnector } from "@/lib/connectors/types";

const autohomeUrl = "http://www.autohome.com.cn/news/";

export const autohomeConnector: SourceConnector = {
  id: "auto",
  label: "Autohome News",
  async fetchItems() {
    const html = await fetchText(autohomeUrl, {
      encoding: "gb18030"
    });

    const items = extractLinksFromHtml(html, {
        baseUrl: autohomeUrl,
        hrefIncludes: ["/news/"],
        limit: SOURCE_FETCH_LIMIT * 2,
        minTitleLength: 8
      })
      .map((item) => ({
        ...item,
        summary: cleanAutohomeSummary(item.summary, item.title),
        title: cleanAutohomeTitle(item.title)
      }))
      .filter((item) => item.title.length >= 8);

    return ensureItems(dedupeByCanonicalUrl(items), this.label);
  }
};

function cleanAutohomeTitle(value: string) {
  const title = cleanAutohomeText(value)
    .split(/\s+\d+(?:分钟|小时|天)前\b/)[0]
    .trim();

  if (title.length <= 70) {
    return title;
  }

  const introIndex = findIntroIndex(title);

  if (introIndex > 8) {
    return title.slice(0, introIndex).trim();
  }

  const repeatedLead = extractRepeatedLead(title);

  if (repeatedLead) {
    return repeatedLead;
  }

  const dateIntroIndex = title.search(/\s+(?:\d{4}年)?\d{1,2}月\d{1,2}日[，,]/);

  if (dateIntroIndex > 8) {
    return title.slice(0, dateIntroIndex).trim();
  }

  const firstSegment = title.split(/\s+/)[0]?.trim();
  const rest = firstSegment ? title.slice(firstSegment.length).trimStart() : "";

  if (firstSegment && firstSegment.length >= 8 && firstSegment.length <= 70 && rest.startsWith(firstSegment.slice(0, 3))) {
    return firstSegment;
  }

  const sentenceTitle = title.match(/^.{8,70}[。！？?]/)?.[0]?.trim();

  if (sentenceTitle) {
    return sentenceTitle;
  }

  return trimTitleBoundary(title.slice(0, 70)).trim();
}

function cleanAutohomeSummary(value: string | undefined, title: string) {
  const cleanTitle = cleanAutohomeTitle(title);

  return cleanAutohomeText(value)
    .replace(cleanTitle, "")
    .replace(/^\s*[：:,-]\s*/, "")
    .trim();
}

function cleanAutohomeText(value?: string) {
  return normalizeText(value ?? "")
    .replace(/\s*刚刚\s+\d+(?:\.\d+)?万?\s+\d+\s*/g, " ")
    .replace(/\s*\d+(?:分钟|小时|天)前\s+\d+(?:\.\d+)?万?\s+\d+\s*/g, " ")
    .replace(/\s*\[汽车之家\s+[^\]]+\]\s*/g, " ")
    .replace(/\s*阅读全文\s*$/g, "")
    .trim();
}

function extractRepeatedLead(title: string) {
  const maxProbeLength = Math.min(70, Math.floor(title.length / 2));

  for (let length = 8; length <= maxProbeLength; length += 1) {
    const prefix = title.slice(0, length);
    const repeatIndex = title.indexOf(prefix, length);

    if (repeatIndex <= 0 || repeatIndex > 120) {
      continue;
    }

    const candidate = title.slice(0, repeatIndex).trim();

    if (candidate.length >= 8 && candidate.length <= 70) {
      return trimTitleBoundary(candidate);
    }

    const firstSegment = candidate.split(/\s+/)[0]?.trim();

    if (firstSegment && firstSegment.length >= 8 && firstSegment.length <= 70) {
      return trimTitleBoundary(firstSegment);
    }
  }

  return undefined;
}

function findIntroIndex(title: string) {
  const patterns = [
    /\s+(?:近日|日前|据悉|据了解|根据)/,
    /\s+(?:\d{1,2}月\d{1,2}日|20\d{2}年|自20\d{2}年)/,
    /\s+[^\s]{2,18}正式(?:发布|推送|公布|宣布|迎来)/
  ];
  const indexes = patterns
    .map((pattern) => title.search(pattern))
    .filter((index) => index > 8);

  return indexes.length ? Math.min(...indexes) : -1;
}

function trimTitleBoundary(value: string) {
  return value.replace(/[\s,，:：;；。!！?？-]+$/g, "").trim();
}

function dedupeByCanonicalUrl<T extends { metric?: string; url: string }>(items: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = item.url.split("#")[0];

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push({
      ...item,
      metric: deduped.length === 0 ? "新" : `${deduped.length + 1}`
    });

    if (deduped.length >= SOURCE_FETCH_LIMIT) {
      break;
    }
  }

  return deduped;
}
