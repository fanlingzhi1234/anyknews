export type NewsCategory =
  | "AI资讯"
  | "技术"
  | "广义资讯"
  | "科技资讯"
  | "娱乐"
  | "金融"
  | "汽车";

export type NewsItem = {
  title: string;
  summary: string;
  metric: string;
  url: string;
};

export type NewsSource = {
  id: string;
  category: NewsCategory;
  logo: string;
  tone: "ai" | "tech" | "news" | "biz" | "ent" | "fin" | "car";
  name: string;
  board: string;
  footer: string;
  items: NewsItem[];
};

const link = "#";

export const sourceHomeUrls: Record<string, string> = {
  ai: "https://www.qbitai.com",
  aibase: "https://news.aibase.com/zh/news",
  tech: "https://github.com/trending",
  v2ex: "https://www.v2ex.com",
  general: "https://www.zhihu.com/hot",
  toutiao: "https://www.toutiao.com",
  "the-paper": "https://www.thepaper.cn",
  biz: "https://36kr.com/information/web_recommend/",
  ent: "https://www.bilibili.com/v/popular/all",
  gamersky: "https://www.gamersky.com",
  finance: "https://xueqiu.com",
  caixin: "https://www.caixin.com",
  auto: "https://www.autohome.com.cn/all/"
};

export const categories: { label: NewsCategory; anchor: string }[] = [
  { label: "AI资讯", anchor: "ai" },
  { label: "技术", anchor: "tech" },
  { label: "广义资讯", anchor: "general" },
  { label: "科技资讯", anchor: "biz" },
  { label: "娱乐", anchor: "ent" },
  { label: "金融", anchor: "finance" },
  { label: "汽车", anchor: "auto" }
];

export const sources: NewsSource[] = [
  {
    id: "ai",
    category: "AI资讯",
    logo: "量",
    tone: "ai",
    name: "量子位",
    board: "每日最新",
    footer: "5分钟前更新 · RSS/HTML",
    items: [
      ["AI Agent 工具链进入密集发布期，企业项目管理开始接入自动化流程", "机器人、研发、协同工具成为本周高频关键词", "新"],
      ["开源大模型推理框架更新，长上下文和多模态能力继续增强", "适合纳入日报中的基础设施方向", "2h"],
      ["人形机器人公司完成新一轮融资，量产与场景落地成为焦点", "量产、成本和真实场景落地仍是看点", "4h"],
      ["多家创业公司发布浏览器 Agent，个人效率产品竞争加速", "从网页执行走向跨应用任务编排", "6h"],
      ["AI 编程助手开始覆盖代码审查、测试生成和项目排期", "研发工作流正在从单点补全转向全流程辅助", "8h"],
      ["大模型 API 价格继续下探，应用层创业门槛降低", "推理成本成为产品毛利的重要变量", "12h"],
      ["多模态 Agent 开始进入办公套件，文档和表格成为入口", "个人知识库与企业协作工具结合更紧", "15h"],
      ["AI 硬件团队密集发布原型机，语音交互是第一入口", "可穿戴、桌面设备和机器人端同步升温", "18h"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "aibase",
    category: "AI资讯",
    logo: "AI",
    tone: "ai",
    name: "AIbase",
    board: "AI新闻资讯",
    footer: "打开/手动刷新时更新 · HTML/RSSHub",
    items: [
      ["OpenAI 发布新模型能力更新，默认体验继续向更低幻觉和更强工具调用演进", "模型性能、产品体验和应用生态是关注重点", "热"],
      ["AI Agent 产品进入密集发布期，浏览器、办公和金融场景同步升温", "智能体从演示走向可执行工作流", "1h"],
      ["大模型公司加速布局企业服务，数据、权限和流程集成成为落地关键", "企业 AI 从单点问答转向业务协同", "3h"],
      ["机器人与具身智能融资继续活跃，量产和供应链能力受到关注", "硬件成本、真实数据和交付能力仍是核心", "5h"],
      ["AI 工具平台更新产品库，图像、视频、编程和办公工具持续迭代", "适合纳入每日 AI 工具观察", "7h"],
      ["科技巨头更新 AI 搜索和浏览器能力，信息入口竞争加剧", "搜索、推荐和摘要能力成为新入口", "9h"],
      ["AI 创业公司推出低代码工作流工具，面向运营和项目管理场景", "非技术用户也能编排自动化任务", "11h"],
      ["开源模型社区发布新训练框架，降低智能体能力复现成本", "训练效率和评测透明度值得追踪", "13h"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "tech",
    category: "技术",
    logo: "GH",
    tone: "tech",
    name: "GitHub",
    board: "Trending",
    footer: "今日 09:40 · HTML 解析",
    items: [
      ["browser-agent-lab / open-operator", "Computer-use agent framework for web workflows", "12k"],
      ["infra-kit / taskgraph", "A DAG scheduler for project automation", "8.4k"],
      ["robotics-ai / sim2real-suite", "Simulation tools for real-world robot learning", "6.1k"],
      ["vector-db / lite-memory", "Small-footprint memory store for agents", "5.8k"],
      ["next-dashboard / compact-grid", "Dense dashboard components for operations UI", "4.9k"],
      ["workflow-ai / agent-runtime", "Runtime primitives for tool-using agents", "4.2k"],
      ["data-pipeline / feed-normalizer", "Normalize RSS, HTML and API payloads", "3.9k"],
      ["devtools / browser-recorder", "Record browser actions into repeatable scripts", "3.4k"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "v2ex",
    category: "技术",
    logo: "V2",
    tone: "tech",
    name: "V2EX",
    board: "热门节点",
    footer: "18分钟前更新 · API/HTML",
    items: [
      ["大家现在怎么管理一堆 AI 订阅和项目上下文？", "效率工具、项目管理、知识沉淀讨论集中", "184"],
      ["有没有适合个人服务器长期跑的 RSS 聚合方案", "部署成本、反爬、更新频率是核心讨论点", "136"],
      ["Cursor / Claude Code / Codex 的体验差异", "代码生成之外，验证和上下文管理更重要", "121"],
      ["小内存云服务器部署 Docker 的注意事项", "2GB 内存可用，但需要控制服务数量", "88"],
      ["如何把飞书机器人做成个人信息中枢", "Webhook、定时任务和摘要格式被反复提到", "63"],
      ["Next.js 做个人 Dashboard 是否太重", "SSR、API route 和部署便利性各有取舍", "57"],
      ["大家用什么方式跟踪 GitHub Trending", "日报、RSS、邮件、Telegram 都有人用", "49"],
      ["网页抓取遇到反爬时有没有轻量替代方案", "优先 RSS/API，Playwright 作为最后兜底", "42"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "general",
    category: "广义资讯",
    logo: "知",
    tone: "news",
    name: "知乎",
    board: "热榜",
    footer: "打开/手动刷新时更新",
    items: [
      ["AI Agent 会不会改变普通人的工作流？", "讨论集中在效率、替代、协作边界", "612万"],
      ["为什么越来越多团队把项目管理搬进自动化平台？", "从记录工具转向执行工具的趋势明显", "420万"],
      ["机器人创业现在处于什么阶段？", "量产能力、供应链和场景验证是核心", "355万"],
      ["个人信息流过载，怎样筛出真正重要的内容？", "关注来源权重、摘要和主动提醒", "290万"],
      ["今天有哪些值得关注的科技新闻？", "AI、汽车、消费电子同时升温", "221万"],
      ["为什么热榜产品仍然有长期需求？", "高效扫描与跳转原文是关键价值", "188万"],
      ["飞书机器人适合做个人提醒入口吗？", "轻量通知和群组协作都比较合适", "142万"],
      ["个人服务器部署信息聚合站有哪些坑？", "安全、备份、反爬和费用需要提前考虑", "98万"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "toutiao",
    category: "广义资讯",
    logo: "头",
    tone: "news",
    name: "今日头条",
    board: "热榜",
    footer: "9分钟前更新 · JSON/API",
    items: [
      ["多地发布产业扶持政策，科技制造继续升温", "政策、资本和制造链条同时活跃", "热"],
      ["新能源汽车价格战进入新阶段", "车企降价、权益和渠道策略变化明显", "热"],
      ["AI 应用进入办公和教育场景", "产品形态从问答工具转向流程工具", "热"],
      ["消费电子新品发布会密集定档", "硬件和大模型功能绑定成为卖点", "新"],
      ["财经市场关注科技龙头财报", "云业务、AI 支出和利润率是重点", "新"],
      ["机器人公司公布量产计划", "供应链和成本控制受到关注", "新"],
      ["本周重点政策时间线出炉", "产业、金融、消费均有新安排", "热"],
      ["头部平台更新内容推荐规则", "创作者和信息分发效率受影响", "热"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "the-paper",
    category: "广义资讯",
    logo: "澎",
    tone: "news",
    name: "澎湃新闻",
    board: "要闻",
    footer: "30分钟前更新 · RSS/HTML",
    items: [
      ["科技创新与产业政策成为今日新闻焦点", "产业链协同和资金支持被多次提及", "1h"],
      ["城市更新、交通和教育议题持续获得关注", "民生议题在多地新闻中占比上升", "2h"],
      ["国际市场波动影响科技板块预期", "全球科技公司估值重新定价", "3h"],
      ["本周重点会议和政策时间线梳理", "适合进入每日简报的背景材料", "5h"],
      ["智能制造项目密集签约", "机器人和新能源相关项目占比较高", "6h"],
      ["跨境科技公司监管议题升温", "数据、合规和财报披露被关注", "8h"],
      ["高校科研成果转化案例增多", "AI 和生命科学方向表现突出", "10h"],
      ["区域产业基金继续加码硬科技", "半导体、机器人、新能源为重点", "12h"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "biz",
    category: "科技资讯",
    logo: "36",
    tone: "biz",
    name: "36氪",
    board: "资讯推荐",
    footer: "14分钟前更新 · 页面数据",
    items: [
      ["AI 办公产品进入付费增长期，企业版成为竞争重点", "项目管理、会议纪要和销售场景率先落地", "新"],
      ["具身智能公司完成融资，机器人量产线启动", "订单和交付能力是资本关注点", "2h"],
      ["云厂商发布新一代推理服务，主打低成本部署", "推理价格下降利好应用层", "3h"],
      ["企业服务赛道开始重新定价 AI 功能", "从免费试用转向团队订阅和席位制", "5h"],
      ["跨境 SaaS 公司推出 Agent 插件", "面向销售、客服和运营流程", "6h"],
      ["芯片创业公司拿到新融资", "推理端芯片成为主要故事线", "8h"],
      ["AI 搜索产品更新移动端体验", "摘要、引用和收藏功能更突出", "9h"],
      ["开发者工具公司发布团队协作版", "项目上下文和权限管理成为卖点", "11h"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "ent",
    category: "娱乐",
    logo: "B",
    tone: "ent",
    name: "哔哩哔哩",
    board: "热门",
    footer: "7分钟前更新 · API",
    items: [
      ["科技 UP 主体验最新 AI 设备，真实生产力如何？", "从新鲜感转向日常效率验证", "368万"],
      ["机器人挑战复杂家务任务，翻车与高光合集", "真实场景能力仍有明显边界", "201万"],
      ["一周游戏新闻：大作发售、新 DLC、玩家评分", "游戏资讯适合轻量扫榜", "146万"],
      ["用 AI 管理一天的工作，到底能省多少时间", "项目管理和日程自动化成为重点", "98万"],
      ["国产独立游戏新作试玩", "美术、机制和口碑开始发酵", "77万"],
      ["数码博主横评 AI 手机功能", "语音、修图和助手能力对比", "64万"],
      ["影视剪辑区本周热门盘点", "新剧、综艺和电影热度集中", "52万"],
      ["游戏掌机新品体验", "便携性能和续航仍是关键", "49万"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "gamersky",
    category: "娱乐",
    logo: "游",
    tone: "ent",
    name: "游民星空",
    board: "今日要闻",
    footer: "22分钟前更新 · RSS/HTML",
    items: [
      ["开放世界新作公布实机演示，发售窗口确认", "地图规模、战斗和剧情成为讨论点", "新"],
      ["年度游戏更新路线图发布，多人模式扩展", "后续 DLC 和赛季内容明确", "2h"],
      ["硬件厂商发布掌机新品，对标高性能便携设备", "售价和散热设计是看点", "4h"],
      ["影视改编游戏新预告上线", "玩家关注还原度和玩法深度", "6h"],
      ["动作游戏试玩版开放下载", "手感和关卡设计评价较高", "8h"],
      ["经典 IP 重制版消息曝光", "画面升级和定价策略引发讨论", "10h"],
      ["电竞赛事总决赛赛程公布", "战队阵容和版本变化受关注", "12h"],
      ["独立游戏展公布多款新作", "创意机制和叙事表达突出", "15h"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "finance",
    category: "金融",
    logo: "雪",
    tone: "fin",
    name: "雪球",
    board: "热门话题",
    footer: "打开/手动刷新时更新 · 热门话题",
    items: [
      ["AI 算力链继续活跃，投资者关注业绩兑现节奏", "订单、毛利和供给能力是核心", "热"],
      ["美股科技龙头财报前瞻：云业务和 AI 支出是看点", "资本开支仍是估值锚点", "热"],
      ["机器人概念股分化，资金转向订单确定性", "主题热度后进入业绩验证期", "热"],
      ["新能源汽车板块关注价格战与出海增速", "销量、单车利润和海外渠道受关注", "新"],
      ["半导体设备板块午后走强", "国产替代和订单预期继续发酵", "新"],
      ["港股科技股回调后资金分歧加大", "互联网、云和硬件链条分化", "热"],
      ["A股成交放量，成长风格表现活跃", "资金回到科技和高端制造", "热"],
      ["财报季临近，软件公司收入质量受关注", "订阅增长和 AI 增值服务是看点", "新"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "caixin",
    category: "金融",
    logo: "财",
    tone: "fin",
    name: "财新",
    board: "科技财经",
    footer: "40分钟前更新 · RSS/HTML",
    items: [
      ["科技公司资本开支上行，市场重新评估 AI 投资回报", "现金流和投资周期被重新审视", "1h"],
      ["半导体产业链订单变化引发关注", "设备、材料和封测环节同步观察", "3h"],
      ["自动驾驶公司商业化进度进入新阶段", "城市运营和法规环境影响落地", "5h"],
      ["跨境科技公司监管和财报时间线", "披露节奏和合规边界需要关注", "7h"],
      ["金融机构加大科技投入", "风控、投研和客服成为应用方向", "8h"],
      ["云服务价格变化影响软件公司成本", "推理需求推动基础设施支出", "10h"],
      ["新能源车企海外业务增速分化", "渠道、关税和品牌建设影响明显", "12h"],
      ["硬科技基金调整投资节奏", "机器人、芯片和 AI Infra 仍受青睐", "15h"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  },
  {
    id: "auto",
    category: "汽车",
    logo: "车",
    tone: "car",
    name: "汽车之家",
    board: "今日焦点",
    footer: "1小时前更新 · HTML",
    items: [
      ["智能驾驶车型密集发布，城市 NOA 覆盖继续扩大", "新车型配置和价格成为用户关注重点", "新"],
      ["新能源车企公布交付数据，海外市场增速明显", "销量、毛利和出海渠道同时受关注", "2h"],
      ["车载语音助手接入大模型，交互体验升级", "语音、多模态和车控能力融合", "4h"],
      ["价格战后的产品策略：补能、智驾、空间继续卷", "车企开始用配置和服务差异化", "6h"],
      ["混动车型新品上市，主打长续航和低油耗", "家庭用户和长途场景是卖点", "8h"],
      ["智能座舱系统更新，应用生态继续扩展", "导航、娱乐和办公能力被加强", "10h"],
      ["主机厂发布机器人相关合作计划", "制造、巡检和服务场景率先落地", "12h"],
      ["电池供应链价格波动影响新车定价", "原材料和产能利用率值得追踪", "15h"]
    ].map(([title, summary, metric]) => ({ title, summary, metric, url: link }))
  }
];
