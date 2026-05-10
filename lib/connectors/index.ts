import { aibaseConnector } from "@/lib/connectors/aibase";
import { autohomeConnector } from "@/lib/connectors/autohome";
import { buildConnectorFromRecipe } from "@/lib/connectors/adapters";
import { bilibiliConnector } from "@/lib/connectors/bilibili";
import { caixinConnector } from "@/lib/connectors/caixin";
import { eastmoneyConnector } from "@/lib/connectors/eastmoney";
import { gamerskyConnector } from "@/lib/connectors/gamersky";
import { githubTrendingConnector } from "@/lib/connectors/github-trending";
import { hackerNewsConnector } from "@/lib/connectors/hacker-news";
import { kr36Connector } from "@/lib/connectors/kr36";
import { qbitaiConnector } from "@/lib/connectors/qbitai";
import { sspaiConnector } from "@/lib/connectors/sspai";
import type { SourceConnector } from "@/lib/connectors/types";
import { thePaperConnector } from "@/lib/connectors/the-paper";
import { toutiaoConnector } from "@/lib/connectors/toutiao";
import { v2exConnector } from "@/lib/connectors/v2ex";
import { xueqiuConnector } from "@/lib/connectors/xueqiu";
import { zhihuConnector } from "@/lib/connectors/zhihu";
import { sourceCatalog } from "@/lib/sources/catalog";

const customConnectors: SourceConnector[] = [
  qbitaiConnector,
  aibaseConnector,
  githubTrendingConnector,
  v2exConnector,
  zhihuConnector,
  toutiaoConnector,
  thePaperConnector,
  kr36Connector,
  bilibiliConnector,
  gamerskyConnector,
  xueqiuConnector,
  caixinConnector,
  autohomeConnector,
  hackerNewsConnector,
  eastmoneyConnector,
  sspaiConnector
];

const recipeConnectors = sourceCatalog
  .map((source) => buildConnectorFromRecipe(source))
  .filter((connector): connector is SourceConnector => Boolean(connector));

export const connectors = new Map(
  [...recipeConnectors, ...customConnectors].map((connector) => [connector.id, connector])
);

export function getConnector(sourceId: string) {
  return connectors.get(sourceId);
}
