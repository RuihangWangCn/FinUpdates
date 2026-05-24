import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Brain,
  Clock3,
  Copy,
  DatabaseZap,
  ExternalLink,
  Flame,
  LineChart,
  LogOut,
  MessageCircle,
  Minus,
  Newspaper,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  User,
} from 'lucide-react'
import {
  buildContrarianResult,
  buildRadarItem,
  buildRuleBriefing,
  type BriefingResult,
  type ContrarianResult,
  type RadarItem,
} from './agentRules'
import './App.css'

type Market = 'A股' | '美股'
type Sentiment = 'bullish' | 'bearish' | 'neutral' | 'mixed'
type Validation = 'validated' | 'not_validated' | 'contradicted' | 'unclear'

type MarketBreadth = {
  market: Market
  tradeDate: string
  updateTime: string
  advancers: number
  decliners: number
  unchanged: number
  limitUp?: number
  limitDown?: number
  turnover: string
  indices: Array<{ name: string; change: number }>
  extra: Array<{ label: string; value: string; tone?: 'up' | 'down' | 'flat' }>
}

type Sector = {
  id: string
  market: Market
  name: string
  change: number
  turnoverRank: number
  hotScore: number
  advancers: number
  decliners?: number
  totalStocks: number
  leaders: string[]
  laggards: string[]
  newsCount: number
  aiRead: string
}

type NewsItem = {
  id: string
  market: Market
  sectorId: string
  sectorName: string
  title: string
  source: string
  publishedAt: string
  tag: string
  relatedTickers: string[]
  rawSummary: string
  sourceUrl: string
}

type CrawledNewsItem = Pick<
  NewsItem,
  'id' | 'title' | 'source' | 'publishedAt' | 'tag' | 'rawSummary' | 'sourceUrl'
>

type CrawledNewsResponse = {
  source: string
  query: string
  fetchedAt: string
  items: CrawledNewsItem[]
}

type CrawledNewsState = {
  status: SourceStatus
  source?: string
  fetchedAt?: string
  query?: string
  items: NewsItem[]
  error?: string
}

type BotMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type DeepSeekChatResponse = {
  answer?: string
  model?: string
  error?: string
}

type RadarResponse = {
  source: string
  market: Market
  fetchedAt: string
  items: RadarItem[]
}

type NewsDirectionStats = {
  up: number
  down: number
  neutral: number
  total: number
  upRatio: number
  downRatio: number
}

type Analysis = {
  sentiment: Sentiment
  impactScore: number
  confidence: number
  marketValidation: Validation
  priceActionRelationship: string
  summary: string
  reasoning: string
  riskNote: string
}

type SourceStatus = 'idle' | 'loading' | 'ready' | 'error'

type LiveIndexQuote = {
  symbol: string
  name: string
  price: number
  change: number
  changeAmount?: number
}

type LiveSectorQuote = {
  symbol: string
  name: string
  price: number
  change: number
  advancers?: number
  decliners?: number
  marketValue?: number
}

type AShareSource = {
  sourceName: string
  sourceUrl: string
  fetchedAt: string
  advancers: number
  decliners: number
  unchanged: number
  turnover: number
  indices: LiveIndexQuote[]
  sectors: LiveSectorQuote[]
}

type UsSource = {
  sourceName: string
  sourceUrl: string
  fetchedAt: string
  proxies: LiveSectorQuote[]
}

type MarketSourceSnapshot = {
  status: SourceStatus
  error?: string
  aShare?: AShareSource
  us?: UsSource
}

type EastmoneyQuote = {
  f2?: number | string
  f3?: number | string
  f4?: number | string
  f6?: number | string
  f12?: string
  f14?: string
  f20?: number | string
  f104?: number | string
  f105?: number | string
  f106?: number | string
}

type EastmoneyResponse = {
  data?: {
    diff?: EastmoneyQuote[]
  }
}

type StooqQuote = {
  symbol: string
  date: string
  time: string
  open: number
  close: number
  volume: number
}

type StooqResponse = {
  source: string
  quotes: StooqQuote[]
}

type TencentIndexResponse = {
  source: string
  indices: Array<LiveIndexQuote & { turnover?: number }>
}

const eastmoneyIndexUrl =
  '/api/a-share-indices'

const eastmoneySectorUrl =
  '/api/eastmoney?target=sectors'

const sourceLinks = {
  eastmoney: 'https://quote.eastmoney.com/center/gridlist.html#hs_a_board',
  tencent: 'https://gu.qq.com/',
  stooq: 'https://stooq.com/',
}

const staticHostingMessage =
  'GitHub Pages 是静态演示版；实时行情、抓新闻和 DeepSeek 问答需要本地 Vite 服务。'

const marketBreadths: MarketBreadth[] = [
  {
    market: 'A股',
    tradeDate: '2026-05-23',
    updateTime: '收盘快照 15:20',
    advancers: 3276,
    decliners: 1784,
    unchanged: 218,
    limitUp: 76,
    limitDown: 13,
    turnover: '1.18 万亿',
    indices: [
      { name: '上证指数', change: 0.42 },
      { name: '深成指', change: 0.88 },
      { name: '创业板指', change: 1.16 },
      { name: '科创 50', change: 1.92 },
    ],
    extra: [
      { label: '北向资金', value: '+46.2 亿', tone: 'up' },
      { label: '中位数涨跌', value: '+0.63%', tone: 'up' },
    ],
  },
  {
    market: '美股',
    tradeDate: '2026-05-22',
    updateTime: '盘后快照 16:10 ET',
    advancers: 4138,
    decliners: 2861,
    unchanged: 366,
    turnover: '1480 亿美元',
    indices: [
      { name: 'S&P 500', change: 0.31 },
      { name: 'Nasdaq', change: 0.74 },
      { name: 'Dow', change: -0.12 },
      { name: 'Russell 2000', change: -0.38 },
    ],
    extra: [
      { label: 'VIX', value: '14.8', tone: 'down' },
      { label: '10Y 美债', value: '4.42%', tone: 'flat' },
    ],
  },
]

const sectors: Sector[] = [
  {
    id: 'cpo',
    market: 'A股',
    name: 'CPO / 光模块',
    change: 5.82,
    turnoverRank: 3,
    hotScore: 96,
    advancers: 34,
    totalStocks: 42,
    leaders: ['新易盛 +12.4%', '中际旭创 +9.8%'],
    laggards: ['华工科技 -1.1%'],
    newsCount: 8,
    aiRead: '利多消息被市场验证，板块放量上涨。',
  },
  {
    id: 'battery',
    market: 'A股',
    name: '电池',
    change: -2.14,
    turnoverRank: 6,
    hotScore: 84,
    advancers: 18,
    totalStocks: 83,
    leaders: ['天赐材料 +2.9%'],
    laggards: ['宁德时代 -3.2%', '亿纬锂能 -4.1%'],
    newsCount: 6,
    aiRead: '政策利好未被价格确认，资金仍偏谨慎。',
  },
  {
    id: '5g',
    market: 'A股',
    name: '5G 通信',
    change: 1.46,
    turnoverRank: 9,
    hotScore: 72,
    advancers: 51,
    totalStocks: 78,
    leaders: ['中兴通讯 +3.7%', '信维通信 +3.3%'],
    laggards: ['烽火通信 -0.8%'],
    newsCount: 5,
    aiRead: '消息偏正面，但成交额没有进入市场主线。',
  },
  {
    id: 'robotics',
    market: 'A股',
    name: '机器人',
    change: 0.96,
    turnoverRank: 5,
    hotScore: 88,
    advancers: 46,
    totalStocks: 71,
    leaders: ['埃斯顿 +4.2%', '绿的谐波 +3.8%'],
    laggards: ['机器人 -0.6%'],
    newsCount: 7,
    aiRead: '人形机器人新闻密集，先看龙头和成交能否持续。',
  },
  {
    id: 'ashare-semis',
    market: 'A股',
    name: '半导体',
    change: 1.28,
    turnoverRank: 4,
    hotScore: 82,
    advancers: 58,
    totalStocks: 96,
    leaders: ['北方华创 +3.6%', '中芯国际 +2.4%'],
    laggards: ['韦尔股份 -1.2%'],
    newsCount: 6,
    aiRead: '设备与国产替代方向有新闻催化，但需要看资金扩散。',
  },
  {
    id: 'compute',
    market: 'A股',
    name: 'AI 算力',
    change: 2.08,
    turnoverRank: 2,
    hotScore: 90,
    advancers: 41,
    totalStocks: 63,
    leaders: ['工业富联 +5.1%', '浪潮信息 +3.9%'],
    laggards: ['中科曙光 -0.9%'],
    newsCount: 8,
    aiRead: '算力链条仍是资金主线之一，重点看订单和资本开支兑现。',
  },
  {
    id: 'ai',
    market: '美股',
    name: 'AI 基础设施',
    change: 2.36,
    turnoverRank: 1,
    hotScore: 94,
    advancers: 23,
    totalStocks: 31,
    leaders: ['NVDA +3.4%', 'AVGO +2.7%'],
    laggards: ['DELL -1.5%'],
    newsCount: 9,
    aiRead: '资本开支预期继续上修，科技权重同步走强。',
  },
  {
    id: 'biotech',
    market: '美股',
    name: '生物科技',
    change: -1.18,
    turnoverRank: 8,
    hotScore: 66,
    advancers: 42,
    totalStocks: 118,
    leaders: ['REGN +1.8%'],
    laggards: ['MRNA -4.6%', 'BNTX -3.1%'],
    newsCount: 4,
    aiRead: '板块下跌与风险偏好下降一致，单条利好难扭转。',
  },
  {
    id: 'semis',
    market: '美股',
    name: '半导体',
    change: 1.72,
    turnoverRank: 2,
    hotScore: 89,
    advancers: 38,
    totalStocks: 54,
    leaders: ['AMD +2.8%', 'MU +2.5%'],
    laggards: ['INTC -0.7%'],
    newsCount: 7,
    aiRead: '设备与存储链条共振，消息与行情方向一致。',
  },
]

const newsItems: NewsItem[] = [
  {
    id: 'n1',
    market: 'A股',
    sectorId: 'cpo',
    sectorName: 'CPO / 光模块',
    title: '海外云厂商上调光模块采购预期，800G 订单能见度提升',
    source: '行业快讯',
    publishedAt: '10:24',
    tag: '订单',
    relatedTickers: ['新易盛', '中际旭创', '天孚通信'],
    rawSummary:
      '多家产业链公司反馈海外 AI 集群建设节奏加快，800G 光模块需求延续高景气。',
    sourceUrl:
      'https://cn.bing.com/search?q=%E6%B5%B7%E5%A4%96%E4%BA%91%E5%8E%82%E5%95%86%E4%B8%8A%E8%B0%83%E5%85%89%E6%A8%A1%E5%9D%97%E9%87%87%E8%B4%AD%E9%A2%84%E6%9C%9F%20800G',
  },
  {
    id: 'n2',
    market: 'A股',
    sectorId: 'battery',
    sectorName: '电池',
    title: '新能源车补贴细则落地，但锂电材料报价继续走弱',
    source: '政策与价格跟踪',
    publishedAt: '11:05',
    tag: '政策',
    relatedTickers: ['宁德时代', '亿纬锂能', '天赐材料'],
    rawSummary:
      '补贴政策稳定终端需求预期，但中游材料价格仍承压，市场担心库存周期未结束。',
    sourceUrl:
      'https://cn.bing.com/search?q=%E6%96%B0%E8%83%BD%E6%BA%90%E8%BD%A6%E8%A1%A5%E8%B4%B4%E7%BB%86%E5%88%99%20%E9%94%82%E7%94%B5%E6%9D%90%E6%96%99%E6%8A%A5%E4%BB%B7',
  },
  {
    id: 'n3',
    market: 'A股',
    sectorId: '5g',
    sectorName: '5G 通信',
    title: '运营商启动新一轮 5G-A 设备集采，通信设备商进入订单窗口',
    source: '招标公告整理',
    publishedAt: '13:12',
    tag: '招标',
    relatedTickers: ['中兴通讯', '烽火通信', '信维通信'],
    rawSummary:
      '三大运营商披露 5G-A 网络升级采购计划，涉及基站设备、射频器件和传输网络。',
    sourceUrl:
      'https://cn.bing.com/search?q=%E8%BF%90%E8%90%A5%E5%95%86%205G-A%20%E8%AE%BE%E5%A4%87%E9%9B%86%E9%87%87%20%E9%80%9A%E4%BF%A1%E8%AE%BE%E5%A4%87%E5%95%86',
  },
  {
    id: 'n4',
    market: '美股',
    sectorId: 'ai',
    sectorName: 'AI 基础设施',
    title: '大型云服务商再度上调 AI 资本开支指引',
    source: '财报电话会摘要',
    publishedAt: '09:48 ET',
    tag: '财报',
    relatedTickers: ['NVDA', 'AVGO', 'SMCI'],
    rawSummary:
      '管理层称 GPU 集群和高速网络需求高于年初预期，全年 AI capex 仍有上修空间。',
    sourceUrl:
      'https://cn.bing.com/search?q=cloud%20provider%20raises%20AI%20capital%20expenditure%20guidance%20NVDA%20AVGO',
  },
  {
    id: 'n5',
    market: '美股',
    sectorId: 'biotech',
    sectorName: '生物科技',
    title: '头部药企临床数据达标，但 XBI 延续弱势',
    source: '医药事件跟踪',
    publishedAt: '12:35 ET',
    tag: '临床',
    relatedTickers: ['REGN', 'MRNA', 'BNTX'],
    rawSummary:
      '单家公司临床结果正面，但生物科技板块受融资环境与风险偏好压制。',
    sourceUrl:
      'https://cn.bing.com/search?q=biotech%20clinical%20data%20XBI%20weakness%20REGN%20MRNA',
  },
  {
    id: 'n6',
    market: '美股',
    sectorId: 'semis',
    sectorName: '半导体',
    title: '存储价格继续上行，设备链订单恢复迹象增强',
    source: '供应链跟踪',
    publishedAt: '14:02 ET',
    tag: '行业数据',
    relatedTickers: ['MU', 'AMAT', 'LRCX'],
    rawSummary:
      'DRAM 和 NAND 报价保持强势，部分晶圆厂释放设备扩产询价信号。',
    sourceUrl:
      'https://cn.bing.com/search?q=memory%20prices%20equipment%20orders%20MU%20AMAT%20LRCX',
  },
]

const sentimentLabels: Record<Sentiment, string> = {
  bullish: '利多',
  bearish: '利空',
  neutral: '中性',
  mixed: '多空交织',
}

const validationLabels: Record<Validation, string> = {
  validated: '已被市场验证',
  not_validated: '尚未被市场验证',
  contradicted: '与行情相反',
  unclear: '信号不足',
}

const relationshipLabels: Record<string, string> = {
  news_supported_by_sector_move: '消息与板块走势同向',
  news_ignored_by_market: '消息暂未带动价格',
  sector_down_despite_positive_news: '利好被更强负面因素压制',
  negative_news_confirmed_by_selloff: '利空被抛售确认',
}

const chinaTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const shortTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const newsTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function normalizeNumber(value: number | string | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatChange(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function toneFromChange(value: number) {
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
}

function buildBingSearchUrl(query: string) {
  return `https://cn.bing.com/search?q=${encodeURIComponent(query)}`
}

function isStaticDemoHost() {
  return window.location.hostname.endsWith('github.io')
}

function buildNewsQuery(market: Market, sector: Sector) {
  const leaderNames = sector.leaders
    .slice(0, 2)
    .map((leader) => leader.split(' ')[0])
    .join(' ')

  return market === 'A股'
    ? `${sector.name} A股 ${leaderNames}`
    : `${sector.name} stocks ${leaderNames}`
}

function formatChinaTime(date: Date) {
  return chinaTimeFormatter.format(date).replace(/\//g, '-')
}

function formatShortChinaTime(value?: string) {
  if (!value) return '尚未拉取'
  return shortTimeFormatter.format(new Date(value))
}

function formatNewsTimestamp(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return newsTimeFormatter.format(date).replace(/\//g, '-')
}

function formatTurnover(value: number) {
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)} 万亿`
  }

  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(0)} 亿`
  }

  return value.toLocaleString('zh-CN')
}

function formatVolume(value?: number) {
  if (!value) return '成交量 --'

  if (value >= 100_000_000) {
    return `成交量 ${(value / 100_000_000).toFixed(2)} 亿`
  }

  if (value >= 10_000) {
    return `成交量 ${(value / 10_000).toFixed(0)} 万`
  }

  return `成交量 ${value.toLocaleString('zh-CN')}`
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`行情源返回 ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function fetchCrawledNews(market: Market, sector: Sector): Promise<CrawledNewsResponse> {
  const query = buildNewsQuery(market, sector)

  return fetchJson<CrawledNewsResponse>(
    `/api/news?market=${encodeURIComponent(market)}&q=${encodeURIComponent(query)}`,
  )
}

async function fetchRadar(market: Market): Promise<RadarResponse> {
  return fetchJson<RadarResponse>(`/api/radar?market=${encodeURIComponent(market)}`)
}

async function fetchContrarianAgent({
  sector,
  news,
}: {
  sector: Sector
  news: NewsItem[]
}): Promise<ContrarianResult & { mode?: string; aiNote?: string; error?: string }> {
  const response = await fetch('/api/agent/contrarian', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sector: {
        id: sector.id,
        market: sector.market,
        name: sector.name,
        change: sector.change,
        hotScore: sector.hotScore,
        leaders: sector.leaders,
      },
      news,
      mode: 'deepseek',
    }),
  })
  const data = (await response.json()) as ContrarianResult & { mode?: string; aiNote?: string; error?: string }

  if (!response.ok) throw new Error(data.error ?? '反证 agent 调用失败')

  return data
}

async function fetchBriefingAgent(radarItems: RadarItem[]): Promise<BriefingResult & { mode?: string; error?: string }> {
  const response = await fetch('/api/agent/briefing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ radarItems, mode: 'deepseek' }),
  })
  const data = (await response.json()) as BriefingResult & { mode?: string; error?: string }

  if (!response.ok) throw new Error(data.error ?? '简报 agent 调用失败')

  return data
}

async function askDeepSeekBot({
  question,
  market,
  sector,
  breadth,
  news,
}: {
  question: string
  market: Market
  sector: Sector
  breadth: MarketBreadth
  news: NewsItem[]
}): Promise<DeepSeekChatResponse> {
  const response = await fetch('/api/deepseek-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question,
      market,
      sector: sector.name,
      marketContext: `${breadth.market}：上涨 ${breadth.advancers} 家，下跌 ${breadth.decliners} 家，成交额 ${breadth.turnover}；${sector.name} 涨跌幅 ${formatChange(
        sector.change,
      )}，热度 ${sector.hotScore}，上涨比例 ${sector.advancers}/${sector.totalStocks}`,
      news: news.slice(0, 10).map((item) => ({
        title: item.title,
        source: item.source,
        publishedAt: item.publishedAt,
        rawSummary: item.rawSummary,
        sourceUrl: item.sourceUrl,
      })),
    }),
  })

  const data = (await response.json()) as DeepSeekChatResponse

  if (!response.ok) {
    throw new Error(data.error ?? 'DeepSeek API 调用失败')
  }

  return data
}

async function fetchAShareSource(): Promise<AShareSource> {
  const indexData = await fetchJson<TencentIndexResponse>(eastmoneyIndexUrl)
  const sectorData = await fetchJson<EastmoneyResponse>(eastmoneySectorUrl).catch(() => undefined)
  const indices = indexData.indices
  const turnover = indices.reduce((total, quote) => total + (quote.turnover ?? 0), 0)

  const sectors = sectorData?.data?.diff?.length
    ? sectorData.data.diff.map((quote) => ({
        symbol: quote.f12 ?? '',
        name: quote.f14 ?? '未知行业',
        price: normalizeNumber(quote.f2),
        change: normalizeNumber(quote.f3),
        advancers: normalizeNumber(quote.f104),
        decliners: normalizeNumber(quote.f105),
        marketValue: normalizeNumber(quote.f20),
      }))
    : indices.map((index) => ({
        symbol: index.symbol,
        name: index.name,
        price: index.price,
        change: index.change,
      }))

  if (!indices.length) {
    throw new Error('腾讯证券没有返回可用指数行情')
  }

  return {
    sourceName: sectorData?.data?.diff?.length ? '腾讯证券 + 东方财富' : indexData.source,
    sourceUrl: sectorData?.data?.diff?.length ? sourceLinks.eastmoney : sourceLinks.tencent,
    fetchedAt: new Date().toISOString(),
    advancers: 0,
    decliners: 0,
    unchanged: 0,
    turnover,
    indices,
    sectors,
  }
}

async function fetchUsSource(): Promise<UsSource> {
  const data = await fetchJson<StooqResponse>(
    '/api/stooq-quotes?symbols=spy.us,qqq.us,dia.us,iwm.us',
  )

  const proxyNames: Record<string, string> = {
    'SPY.US': 'S&P 500 ETF',
    'QQQ.US': 'Nasdaq 100 ETF',
    'DIA.US': 'Dow ETF',
    'IWM.US': 'Russell 2000 ETF',
  }

  return {
    sourceName: data.source,
    sourceUrl: sourceLinks.stooq,
    fetchedAt: new Date().toISOString(),
    proxies: data.quotes.map((quote) => ({
      symbol: quote.symbol,
      name: proxyNames[quote.symbol] ?? quote.symbol,
      price: quote.close,
      change: quote.open ? ((quote.close - quote.open) / quote.open) * 100 : 0,
      marketValue: quote.volume,
    })),
  }
}

async function loadMarketSourceSnapshot(): Promise<MarketSourceSnapshot> {
  const results = await Promise.allSettled([fetchAShareSource(), fetchUsSource()])
  const [aShareResult, usResult] = results
  const nextSnapshot: MarketSourceSnapshot = {
    status: results.some((result) => result.status === 'fulfilled') ? 'ready' : 'error',
  }

  if (aShareResult.status === 'fulfilled') {
    nextSnapshot.aShare = aShareResult.value
  }

  if (usResult.status === 'fulfilled') {
    nextSnapshot.us = usResult.value
  }

  if (results.some((result) => result.status === 'rejected')) {
    nextSnapshot.error = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => (result.reason instanceof Error ? result.reason.message : '行情源失败'))
      .join('；')
  }

  return nextSnapshot
}

const legacyCustomSectorsKey = 'finupdates.customSectors'
const userNameKey = 'finupdates.userName'

function normalizeUserName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 18)
}

function customSectorsKey(userName: string) {
  return `finupdates.customSectors.${encodeURIComponent(userName.toLowerCase())}`
}

function readStoredUserName() {
  if (typeof window === 'undefined') return ''

  return normalizeUserName(window.localStorage.getItem(userNameKey) ?? '')
}

function writeStoredUserName(userName: string) {
  window.localStorage.setItem(userNameKey, userName)
}

function clearStoredUserName() {
  window.localStorage.removeItem(userNameKey)
}

function readStoredCustomSectors(userName: string) {
  if (typeof window === 'undefined') return []

  try {
    const userValue = window.localStorage.getItem(customSectorsKey(userName))
    const parsed = JSON.parse(userValue ?? window.localStorage.getItem(legacyCustomSectorsKey) ?? '[]')

    return Array.isArray(parsed) ? (parsed as Sector[]) : []
  } catch {
    return []
  }
}

function writeStoredCustomSectors(userName: string, items: Sector[]) {
  window.localStorage.setItem(customSectorsKey(userName), JSON.stringify(items))
}

const upSignalKeywords = [
  '上涨',
  '大涨',
  '涨停',
  '领涨',
  '走强',
  '突破',
  '新高',
  '增长',
  '扩产',
  '订单',
  '火爆',
  '提速',
  '飘红',
  '反弹',
]

const downSignalKeywords = [
  '下跌',
  '普跌',
  '跌停',
  '退市',
  '终止上市',
  '下挫',
  '调整',
  '亏损',
  '减持',
  '承压',
  '走弱',
  '回调',
  '风险',
]

function countKeywordHits(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(keyword)).length
}

function buildNewsDirectionStats(news: NewsItem[]): NewsDirectionStats {
  const stats = news.reduce(
    (result, item) => {
      const text = `${item.title} ${item.rawSummary}`
      const upHits = countKeywordHits(text, upSignalKeywords)
      const downHits = countKeywordHits(text, downSignalKeywords)

      if (upHits > downHits) result.up += 1
      else if (downHits > upHits) result.down += 1
      else result.neutral += 1

      return result
    },
    { up: 0, down: 0, neutral: 0 },
  )
  const total = news.length

  return {
    ...stats,
    total,
    upRatio: total ? Math.round((stats.up / total) * 100) : 0,
    downRatio: total ? Math.round((stats.down / total) * 100) : 0,
  }
}

function buildStoredDirectionStats(sector: Sector): NewsDirectionStats {
  const up = sector.advancers
  const down = sector.decliners ?? 0
  const total = sector.totalStocks || sector.newsCount
  const neutral = Math.max(0, total - up - down)

  return {
    up,
    down,
    neutral,
    total,
    upRatio: total ? Math.round((up / total) * 100) : 0,
    downRatio: total ? Math.round((down / total) * 100) : 0,
  }
}

function buildAnalysis(news: NewsItem, sector: Sector, breadth: MarketBreadth): Analysis {
  const sectorIsUp = sector.change > 0
  const broadMarketTone = breadth.advancers > breadth.decliners ? '整体市场偏强' : '整体市场偏弱'
  const sentiment: Sentiment =
    sector.id === 'battery' || sector.id === 'biotech'
      ? 'mixed'
      : sectorIsUp
        ? 'bullish'
        : 'bearish'
  const marketValidation: Validation =
    sentiment === 'bullish' && sectorIsUp
      ? 'validated'
      : sentiment === 'mixed' && !sectorIsUp
        ? 'contradicted'
        : sectorIsUp
          ? 'unclear'
          : 'not_validated'

  const priceActionRelationship =
    marketValidation === 'validated'
      ? 'news_supported_by_sector_move'
      : marketValidation === 'contradicted'
        ? 'sector_down_despite_positive_news'
        : 'news_ignored_by_market'

  return {
    sentiment,
    impactScore: sector.hotScore > 90 ? 5 : sector.hotScore > 80 ? 4 : 3,
    confidence: sector.hotScore > 90 ? 0.84 : 0.73,
    marketValidation,
    priceActionRelationship,
    summary:
      marketValidation === 'validated'
        ? `${news.title} 偏利多，并且 ${sector.name} 当日上涨 ${formatChange(sector.change)}，${sector.advancers}/${sector.totalStocks} 只成分股上涨，说明消息与资金方向一致。`
        : `${news.title} 不能只按标题判断。${sector.name} 当日表现为 ${formatChange(sector.change)}，市场价格反馈弱于消息表面含义，需要把它视为未充分验证的信号。`,
    reasoning: `DeepSeek 分析应同时读取新闻、指数涨跌、上涨下跌家数、板块涨跌幅、成交热度和相关个股表现。本次快照中，${breadth.market} 上涨 ${breadth.advancers} 家、下跌 ${breadth.decliners} 家，${broadMarketTone}；${sector.name} 热度分 ${sector.hotScore}，成交额排名第 ${sector.turnoverRank}。因此这条消息的意义不是孤立的“利多利空”，而是它是否解释了当天板块和个股的实际走势。`,
    riskNote:
      '该结论只用于信息整理，不构成投资建议。若后续公告细节、业绩兑现、宏观流动性或板块资金方向变化，当前归因可能失效。',
  }
}

function App() {
  const [userName, setUserName] = useState(() => readStoredUserName())
  const [loginName, setLoginName] = useState(() => readStoredUserName())
  const [activeMarket, setActiveMarket] = useState<Market>('A股')
  const [selectedSectorId, setSelectedSectorId] = useState('cpo')
  const [selectedNewsId, setSelectedNewsId] = useState('n1')
  const [analysisCache, setAnalysisCache] = useState<Record<string, Analysis>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [marketSource, setMarketSource] = useState<MarketSourceSnapshot>({
    status: 'idle',
  })
  const [crawledNewsBySector, setCrawledNewsBySector] = useState<
    Record<string, CrawledNewsState>
  >({})
  const [customSectors, setCustomSectors] = useState<Sector[]>(() => {
    const storedUserName = readStoredUserName()

    return storedUserName ? readStoredCustomSectors(storedUserName) : []
  })
  const [customSectorName, setCustomSectorName] = useState('')
  const [botQuestion, setBotQuestion] = useState('')
  const [botMessages, setBotMessages] = useState<BotMessage[]>([])
  const [botStatus, setBotStatus] = useState<SourceStatus>('idle')
  const [botError, setBotError] = useState<string | undefined>()
  const [radarSnapshot, setRadarSnapshot] = useState<RadarResponse | undefined>()
  const [radarStatus, setRadarStatus] = useState<SourceStatus>('idle')
  const [radarError, setRadarError] = useState<string | undefined>()
  const [briefing, setBriefing] = useState<BriefingResult | undefined>()
  const [briefingStatus, setBriefingStatus] = useState<SourceStatus>('idle')
  const [briefingError, setBriefingError] = useState<string | undefined>()
  const [contrarianBySector, setContrarianBySector] = useState<Record<string, ContrarianResult & { aiNote?: string; mode?: string }>>({})

  const breadth = marketBreadths.find((item) => item.market === activeMarket)!
  const displayBreadth = useMemo<MarketBreadth>(() => {
    if (activeMarket !== 'A股' || !marketSource.aShare) return breadth

    return {
      ...breadth,
      updateTime: `${marketSource.aShare.sourceName} ${formatShortChinaTime(
        marketSource.aShare.fetchedAt,
      )}`,
      advancers: marketSource.aShare.advancers || breadth.advancers,
      decliners: marketSource.aShare.decliners || breadth.decliners,
      unchanged: marketSource.aShare.unchanged || breadth.unchanged,
      turnover: marketSource.aShare.turnover ? formatTurnover(marketSource.aShare.turnover) : breadth.turnover,
      indices: marketSource.aShare.indices.map((index) => ({
        name: index.name,
        change: index.change,
      })),
      extra: [
        {
          label: '行情源',
          value: marketSource.aShare.sourceName,
          tone: 'flat',
        },
        {
          label: '拉取时间',
          value: formatShortChinaTime(marketSource.aShare.fetchedAt),
          tone: 'flat',
        },
      ],
    }
  }, [activeMarket, breadth, marketSource.aShare])
  const sectorUniverse = useMemo(() => [...sectors, ...customSectors], [customSectors])
  const visibleSectors = useMemo(
    () =>
      sectorUniverse
        .filter((sector) => sector.market === activeMarket)
        .sort((a, b) => b.hotScore - a.hotScore),
    [activeMarket, sectorUniverse],
  )
  const selectedSector =
    visibleSectors.find((sector) => sector.id === selectedSectorId) ?? visibleSectors[0]
  const staticNews = newsItems.filter(
    (news) => news.market === activeMarket && news.sectorId === selectedSector.id,
  )
  const crawledNewsState = crawledNewsBySector[selectedSector.id]
  const visibleNews = crawledNewsState?.items.length
    ? [...crawledNewsState.items, ...staticNews]
    : staticNews
  const selectedNews =
    visibleNews.find((news) => news.id === selectedNewsId) ?? visibleNews[0]
  const selectedAnalysis = selectedNews ? analysisCache[selectedNews.id] : undefined
  const localRadarItems = useMemo(
    () =>
      visibleSectors
        .map((sector) =>
          buildRadarItem(
            {
              id: sector.id,
              market: sector.market,
              name: sector.name,
              change: sector.change,
              hotScore: sector.hotScore,
              leaders: sector.leaders,
            },
            crawledNewsBySector[sector.id]?.items ?? newsItems.filter((news) => news.sectorId === sector.id),
          ),
        )
        .sort((a, b) => b.heatScore - a.heatScore),
    [crawledNewsBySector, visibleSectors],
  )
  const customRadarItems = localRadarItems.filter((item) => item.sectorId.startsWith('custom-'))
  const radarItems = useMemo(() => {
    const serverItems = radarSnapshot?.market === activeMarket ? radarSnapshot.items : []
    const merged = [...customRadarItems, ...serverItems]
    const bySector = new Map<string, RadarItem>()

    ;(merged.length ? merged : localRadarItems).forEach((item) => {
      bySector.set(item.sectorId, item)
    })

    return Array.from(bySector.values()).sort((a, b) => b.heatScore - a.heatScore)
  }, [activeMarket, customRadarItems, localRadarItems, radarSnapshot])
  const selectedRadarItem = radarItems.find((item) => item.sectorId === selectedSector.id)
  const isCustomSelectedSector = selectedSector.id.startsWith('custom-')
  const customDirectionBySector = useMemo(() => {
    const entries = customSectors.map((sector) => [
      sector.id,
      crawledNewsBySector[sector.id]?.items.length
        ? buildNewsDirectionStats(crawledNewsBySector[sector.id].items)
        : buildStoredDirectionStats(sector),
    ])

    return Object.fromEntries(entries) as Record<string, NewsDirectionStats>
  }, [crawledNewsBySector, customSectors])
  const selectedDirectionStats = isCustomSelectedSector
    ? customDirectionBySector[selectedSector.id] ?? buildNewsDirectionStats(visibleNews)
    : undefined
  const ruleBriefing = useMemo(() => buildRuleBriefing(radarItems), [radarItems])
  const activeContrarian =
    contrarianBySector[selectedSector.id] ??
    buildContrarianResult(
      {
        id: selectedSector.id,
        market: selectedSector.market,
        name: selectedSector.name,
        change: selectedSector.change,
        hotScore: selectedSector.hotScore,
        leaders: selectedSector.leaders,
      },
      visibleNews,
    )
  const activeSource =
    activeMarket === 'A股' ? marketSource.aShare : marketSource.us
  const sourceItems =
    activeMarket === 'A股'
      ? marketSource.aShare?.sectors
      : marketSource.us?.proxies

  const refreshMarketSources = useCallback(async () => {
    if (isStaticDemoHost()) {
      setMarketSource({ status: 'idle', error: staticHostingMessage })
      return
    }

    setMarketSource((source) => ({ ...source, status: 'loading', error: undefined }))
    setMarketSource(await loadMarketSourceSnapshot())
  }, [])

  const refreshRadar = useCallback(async () => {
    if (isStaticDemoHost()) {
      setRadarError(staticHostingMessage)
      setRadarStatus('idle')
      return
    }

    setRadarStatus('loading')
    setRadarError(undefined)

    try {
      setRadarSnapshot(await fetchRadar(activeMarket))
      setRadarStatus('ready')
    } catch (error) {
      setRadarError(error instanceof Error ? error.message : '雷达 agent 暂不可用')
      setRadarStatus('error')
    }
  }, [activeMarket])

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(new Date()), 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (userName) writeStoredCustomSectors(userName, customSectors)
  }, [customSectors, userName])

  useEffect(() => {
    refreshRadar()
  }, [refreshRadar])

  useEffect(() => {
    let isMounted = true

    if (isStaticDemoHost()) {
      setMarketSource({ status: 'idle', error: staticHostingMessage })
      return () => {
        isMounted = false
      }
    }

    loadMarketSourceSnapshot().then((snapshot) => {
      if (isMounted) setMarketSource(snapshot)
    })

    return () => {
      isMounted = false
    }
  }, [])

  function switchMarket(market: Market) {
    const firstSector = sectorUniverse.find((sector) => sector.market === market)!
    const firstNews = newsItems.find((news) => news.sectorId === firstSector.id)!
    setActiveMarket(market)
    setSelectedSectorId(firstSector.id)
    if (firstNews) setSelectedNewsId(firstNews.id)
  }

  function selectSector(sector: Sector) {
    const firstNews =
      crawledNewsBySector[sector.id]?.items[0] ?? newsItems.find((news) => news.sectorId === sector.id)
    setSelectedSectorId(sector.id)
    if (firstNews) setSelectedNewsId(firstNews.id)
  }

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextUserName = normalizeUserName(loginName)

    if (!nextUserName) return

    setUserName(nextUserName)
    setLoginName(nextUserName)
    writeStoredUserName(nextUserName)
    setCustomSectors(readStoredCustomSectors(nextUserName))
    setSelectedSectorId('cpo')
    setSelectedNewsId('n1')
  }

  function logoutUser() {
    clearStoredUserName()
    setUserName('')
    setLoginName('')
    setCustomSectors([])
    setSelectedSectorId('cpo')
    setSelectedNewsId('n1')
  }

  function removeCustomSector(sectorId: string) {
    const nextCustomSectors = customSectors.filter((sector) => sector.id !== sectorId)

    setCustomSectors(nextCustomSectors)
    setCrawledNewsBySector((state) => {
      const nextState = { ...state }
      delete nextState[sectorId]
      return nextState
    })
    setContrarianBySector((state) => {
      const nextState = { ...state }
      delete nextState[sectorId]
      return nextState
    })

    if (selectedSectorId !== sectorId) return

    const nextSector = [...sectors, ...nextCustomSectors]
      .filter((sector) => sector.market === activeMarket)
      .sort((a, b) => b.hotScore - a.hotScore)[0]
    const nextNews =
      (nextSector ? crawledNewsBySector[nextSector.id]?.items[0] : undefined) ??
      newsItems.find((news) => news.sectorId === nextSector?.id)

    if (nextSector) setSelectedSectorId(nextSector.id)
    setSelectedNewsId(nextNews?.id ?? '')
  }

  async function crawlSectorNews() {
    const sector = selectedSector

    if (isStaticDemoHost()) {
      setCrawledNewsBySector((state) => ({
        ...state,
        [sector.id]: {
          status: 'error',
          items: state[sector.id]?.items ?? [],
          error: staticHostingMessage,
        },
      }))
      return
    }

    setCrawledNewsBySector((state) => ({
      ...state,
      [sector.id]: {
        ...state[sector.id],
        status: 'loading',
        items: state[sector.id]?.items ?? [],
        error: undefined,
      },
    }))

    try {
      const response = await fetchCrawledNews(activeMarket, sector)
      const crawledItems = response.items.map((item) => ({
        ...item,
        market: activeMarket,
        sectorId: sector.id,
        sectorName: sector.name,
        publishedAt: formatNewsTimestamp(item.publishedAt),
        relatedTickers: sector.leaders.slice(0, 2).map((leader) => leader.split(' ')[0]),
      }))
      const crawledRadarItem = buildRadarItem(
        {
          id: sector.id,
          market: sector.market,
          name: sector.name,
          change: sector.change,
          hotScore: sector.hotScore,
          leaders: sector.leaders,
        },
        crawledItems,
      )
      const crawledDirectionStats = buildNewsDirectionStats(crawledItems)

      setCrawledNewsBySector((state) => ({
        ...state,
        [sector.id]: {
          status: 'ready',
          source: response.source,
          fetchedAt: response.fetchedAt,
          query: response.query,
          items: crawledItems,
        },
      }))

      if (sector.id.startsWith('custom-')) {
        setCustomSectors((items) =>
          items.map((item) =>
            item.id === sector.id
              ? {
                  ...item,
                  hotScore: crawledRadarItem.heatScore,
                  newsCount: crawledRadarItem.newsCount,
                  advancers: crawledDirectionStats.up,
                  decliners: crawledDirectionStats.down,
                  totalStocks: crawledDirectionStats.total,
                  aiRead: `已抓取 ${crawledRadarItem.newsCount} 条相关新闻，新闻热度 ${crawledRadarItem.heatScore}。`,
                }
              : item,
          ),
        )
      }

      if (crawledItems[0]) {
        setSelectedNewsId(crawledItems[0].id)
      }

      setContrarianBySector((state) => ({
        ...state,
        [sector.id]: buildContrarianResult(
          {
            id: sector.id,
            market: sector.market,
            name: sector.name,
            change: sector.change,
            hotScore: sector.hotScore,
            leaders: sector.leaders,
          },
          crawledItems,
        ),
      }))
    } catch (error) {
      setCrawledNewsBySector((state) => ({
        ...state,
        [sector.id]: {
          ...state[sector.id],
          status: 'error',
          items: state[sector.id]?.items ?? [],
          error: error instanceof Error ? error.message : '新闻抓取失败',
        },
      }))
    }
  }

  async function runContrarianAgent() {
    if (!visibleNews.length || isStaticDemoHost()) return

    setContrarianBySector((state) => ({
      ...state,
      [selectedSector.id]: buildContrarianResult(
        {
          id: selectedSector.id,
          market: selectedSector.market,
          name: selectedSector.name,
          change: selectedSector.change,
          hotScore: selectedSector.hotScore,
          leaders: selectedSector.leaders,
        },
        visibleNews,
      ),
    }))

    try {
      const result = await fetchContrarianAgent({ sector: selectedSector, news: visibleNews })

      setContrarianBySector((state) => ({
        ...state,
        [selectedSector.id]: result,
      }))
    } catch {
      // Rule result above is the intended no-key/no-budget fallback.
    }
  }

  async function runBriefingAgent() {
    if (isStaticDemoHost()) {
      setBriefing(ruleBriefing)
      setBriefingError(staticHostingMessage)
      return
    }

    setBriefingStatus('loading')
    setBriefingError(undefined)

    try {
      setBriefing(await fetchBriefingAgent(radarItems))
      setBriefingStatus('ready')
    } catch (error) {
      setBriefing(ruleBriefing)
      setBriefingError(error instanceof Error ? error.message : '简报 agent 已降级为规则版')
      setBriefingStatus('error')
    }
  }

  async function copyBriefing() {
    await window.navigator.clipboard.writeText((briefing ?? ruleBriefing).briefText)
  }

  function submitCustomSector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = customSectorName.trim()

    if (!name) return

    const customSector: Sector = {
      id: `custom-${activeMarket}-${Date.now()}`,
      market: activeMarket,
      name,
      change: 0,
      turnoverRank: 0,
      hotScore: 50,
      advancers: 0,
      decliners: 0,
      totalStocks: 0,
      leaders: [],
      laggards: [],
      newsCount: 0,
      aiRead: '自选板块，先抓取新闻，再让 DeepSeek 按需回答问题。',
    }

    setCustomSectors((items) => [customSector, ...items])
    setSelectedSectorId(customSector.id)
    setSelectedNewsId('')
    setCustomSectorName('')
  }

  async function submitBotQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const question = botQuestion.trim()

    if (!question || botStatus === 'loading') return

    if (isStaticDemoHost()) {
      setBotError(staticHostingMessage)
      setBotStatus('error')
      return
    }

    const userMessage: BotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    }

    setBotMessages((messages) => [...messages, userMessage])
    setBotQuestion('')
    setBotStatus('loading')
    setBotError(undefined)

    try {
      const response = await askDeepSeekBot({
        question,
        market: activeMarket,
        sector: selectedSector,
        breadth: displayBreadth,
        news: visibleNews,
      })

      setBotMessages((messages) => [
        ...messages,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.answer || 'DeepSeek 没有返回内容。',
        },
      ])
      setBotStatus('ready')
    } catch (error) {
      setBotError(error instanceof Error ? error.message : 'DeepSeek 问答失败')
      setBotStatus('error')
    }
  }

  function analyzeNews() {
    if (!selectedNews || analysisCache[selectedNews.id]) return

    setLoadingId(selectedNews.id)
    window.setTimeout(() => {
      setAnalysisCache((cache) => ({
        ...cache,
        [selectedNews.id]: buildAnalysis(selectedNews, selectedSector, displayBreadth),
      }))
      setLoadingId(null)
    }, 760)
  }

  function searchBing(query: string) {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return
    window.open(buildBingSearchUrl(trimmedQuery), '_blank', 'noopener,noreferrer')
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    searchBing(searchQuery)
  }

  if (!userName) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={submitLogin}>
          <div className="login-icon">
            <User size={22} />
          </div>
          <p className="eyebrow">FinUpdates</p>
          <h1>输入名字进入</h1>
          <p>不用密码，只用来保存你的自选板块和页面偏好。</p>
          <label htmlFor="login-name">名字</label>
          <input
            id="login-name"
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            placeholder="例如：Chris"
            autoComplete="name"
            autoFocus
          />
          <button type="submit">进入</button>
        </form>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">FinUpdates MVP</p>
          <h1>市场宽度 + 热门板块 + AI 消息归因</h1>
          <p className="current-time">
            <Clock3 size={14} />
            当前北京时间 {formatChinaTime(currentTime)}
          </p>
        </div>
        <div className="topbar-actions">
          <form className="search-form" onSubmit={submitSearch}>
            <Search size={17} />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="用 Bing 搜索相关新闻"
              aria-label="用 Bing 搜索相关新闻"
            />
            <button type="submit">搜索</button>
          </form>
          <div className="market-switch" aria-label="市场切换">
            {(['A股', '美股'] as Market[]).map((market) => (
              <button
                key={market}
                type="button"
                className={activeMarket === market ? 'active' : ''}
                onClick={() => switchMarket(market)}
              >
                {market}
              </button>
            ))}
          </div>
          <div className="user-chip">
            <User size={15} />
            <span>{userName}</span>
            <button type="button" onClick={logoutUser} aria-label="切换用户" title="切换用户">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      <section className="agent-dashboard" aria-label="Agent 新闻雷达">
        <article className="radar-board">
          <div className="panel-header">
            <div className="section-title">
              <Flame size={18} />
              <span>Agent 新闻雷达榜</span>
            </div>
            <button
              type="button"
              className="crawler-action"
              onClick={refreshRadar}
              disabled={radarStatus === 'loading'}
            >
              <RefreshCw size={14} />
              {radarStatus === 'loading' ? '刷新中' : '刷新雷达'}
            </button>
          </div>
          <p className="agent-subtitle">
            Crawler、Dedup、Heat Agent 先用规则跑；DeepSeek 只在反证、简报和提问时低频使用。
            {radarError ? ` ${radarError}` : ''}
          </p>
          <div className="radar-list">
            {radarItems.slice(0, 8).map((item) => {
              const sector = visibleSectors.find((candidate) => candidate.id === item.sectorId)

              return (
                <button
                  key={item.sectorId}
                  type="button"
                  className={`radar-row ${selectedSector.id === item.sectorId ? 'selected' : ''}`}
                  onClick={() => {
                    if (sector) selectSector(sector)
                  }}
                >
                  <span className="radar-rank">{item.heatScore}</span>
                  <span className="radar-main">
                    <strong>{item.sectorName}</strong>
                    <span>{item.latestNews?.title ?? '等待抓取新闻'}</span>
                  </span>
                  <span className="radar-side">
                    <span>{item.newsCount} 条</span>
                    <em>{item.riskLabel}</em>
                  </span>
                </button>
              )
            })}
          </div>
        </article>

        <article className="briefing-card">
          <div className="panel-header">
            <div className="section-title">
              <Bot size={18} />
              <span>今日群聊简报</span>
            </div>
            <button
              type="button"
              className="crawler-action"
              onClick={runBriefingAgent}
              disabled={briefingStatus === 'loading'}
            >
              <Sparkles size={14} />
              {briefingStatus === 'loading' ? '生成中' : '生成简报'}
            </button>
          </div>
          <pre className="briefing-text">{(briefing ?? ruleBriefing).briefText}</pre>
          {briefingError && <p className="agent-warning">{briefingError}</p>}
          <button type="button" className="copy-action" onClick={copyBriefing}>
            <Copy size={14} />
            复制群聊摘要
          </button>
        </article>

        <article className="contrarian-card">
          <div className="panel-header">
            <div className="section-title">
              <AlertTriangle size={18} />
              <span>反证提醒</span>
            </div>
            <button type="button" className="crawler-action" onClick={runContrarianAgent}>
              <Brain size={14} />
              检查当前板块
            </button>
          </div>
          <strong className="risk-label">{activeContrarian.riskLabel}</strong>
          <ul className="counterpoint-list">
            {activeContrarian.counterpoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          {activeContrarian.aiNote && <p className="agent-note">{activeContrarian.aiNote}</p>}
        </article>
      </section>

      <section className="summary-grid" aria-label="市场概览">
        <article className="market-card breadth-card">
          <div className="section-title">
            <Activity size={18} />
            <span>{displayBreadth.market} 市场宽度</span>
          </div>
          <div className="breadth-number-row">
            <Metric label="上涨家数" value={displayBreadth.advancers.toLocaleString()} tone="up" />
            <Metric label="下跌家数" value={displayBreadth.decliners.toLocaleString()} tone="down" />
            <Metric label="平盘" value={displayBreadth.unchanged.toLocaleString()} tone="flat" />
          </div>
          <div className="micro-grid">
            {displayBreadth.limitUp !== undefined && (
              <>
                <Metric label="涨停" value={displayBreadth.limitUp.toString()} tone="up" compact />
                <Metric label="跌停" value={displayBreadth.limitDown!.toString()} tone="down" compact />
              </>
            )}
            <Metric label="成交额" value={displayBreadth.turnover} tone="flat" compact />
            {displayBreadth.extra.map((item) => (
              <Metric
                key={item.label}
                label={item.label}
                value={item.value}
                tone={item.tone ?? 'flat'}
                compact
              />
            ))}
          </div>
          <p className="timestamp">
            <Clock3 size={14} />
            {displayBreadth.tradeDate} · {displayBreadth.updateTime}
          </p>
        </article>

        <article className="market-card index-card">
          <div className="section-title">
            <LineChart size={18} />
            <span>主要指数</span>
          </div>
          <div className="index-list">
            {displayBreadth.indices.map((index) => (
              <div key={index.name} className="index-row">
                <span>{index.name}</span>
                <strong className={toneFromChange(index.change)}>
                  {formatChange(index.change)}
                </strong>
              </div>
            ))}
          </div>
        </article>

        <article className="market-card thesis-card">
          <div className="section-title">
            <Brain size={18} />
            <span>朋友群简报模式</span>
          </div>
          <p>
            先给朋友看市场强弱和主线，再按需要点开某条消息做解释。
            AI 只在明确点击后运行，不会自动消耗 API。
          </p>
          <div className="status-strip">
            <DatabaseZap size={16} />
            <span>行情自动刷新；DeepSeek 必须手动触发，结果缓存复用</span>
          </div>
        </article>
      </section>

      <section className="source-strip" aria-label="行情信源">
        <div className="source-strip-main">
          <div className="section-title">
            <Radio size={18} />
            <span>行情信源</span>
          </div>
          <p>
            {activeSource
              ? `${activeSource.sourceName} · 拉取 ${formatShortChinaTime(activeSource.fetchedAt)}`
              : marketSource.status === 'loading'
                ? '正在拉取行情源'
                : '等待行情源'}
            {marketSource.error ? ` · ${marketSource.error}` : ''}
          </p>
        </div>
        <div className="source-list">
          {sourceItems?.slice(0, 4).map((item) => (
            <a
              key={item.symbol}
              className="source-chip"
              href={activeSource?.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <span>{item.name}</span>
              <strong className={toneFromChange(item.change)}>{formatChange(item.change)}</strong>
              <small>
                {activeMarket === 'A股'
                  ? item.advancers !== undefined
                    ? `${item.advancers} 涨 / ${item.decliners ?? 0} 跌`
                    : `点位 ${item.price.toLocaleString('zh-CN')}`
                  : formatVolume(item.marketValue)}
              </small>
            </a>
          ))}
          {!sourceItems?.length && (
            <span className="source-placeholder">
              {marketSource.status === 'error' ? '行情源暂不可用' : '行情源加载中'}
            </span>
          )}
        </div>
        <button
          type="button"
          className="source-refresh"
          onClick={refreshMarketSources}
          disabled={marketSource.status === 'loading'}
        >
          <RefreshCw size={15} />
          刷新行情
        </button>
      </section>

      <section className="workspace">
        <aside className="sector-panel">
          <div className="panel-header">
            <div className="section-title">
              <BarChart3 size={18} />
              <span>热门板块</span>
            </div>
            <span className="muted">按热度分排序</span>
          </div>
          <div className="sector-list">
            {visibleSectors.map((sector) => {
              const isCustomSector = sector.id.startsWith('custom-')

              return (
                <div
                  key={sector.id}
                  className={`sector-row ${selectedSector.id === sector.id ? 'selected' : ''}`}
                >
                  <button
                    type="button"
                    className="sector-select"
                    onClick={() => selectSector(sector)}
                  >
                    <span className="sector-main">
                      <span className="sector-name">{sector.name}</span>
                      <span className="sector-context">
                        {isCustomSector
                          ? `涨 ${customDirectionBySector[sector.id]?.up ?? sector.advancers} / 跌 ${
                              customDirectionBySector[sector.id]?.down ?? 0
                            } · ${sector.newsCount} 条`
                          : `${sector.advancers}/${sector.totalStocks} 上涨 · ${sector.newsCount} 条消息`}
                      </span>
                    </span>
                    <span className="sector-side">
                      <strong className={isCustomSector ? 'flat' : toneFromChange(sector.change)}>
                        {isCustomSector ? `热度 ${sector.hotScore}` : formatChange(sector.change)}
                      </strong>
                      <span>{isCustomSector ? '自选' : `热度 ${sector.hotScore}`}</span>
                    </span>
                  </button>
                  {isCustomSector && (
                    <button
                      type="button"
                      className="sector-remove"
                      onClick={() => removeCustomSector(sector.id)}
                      aria-label={`移除 ${sector.name}`}
                      title={`移除 ${sector.name}`}
                    >
                      <Minus size={15} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <form className="custom-sector-form" onSubmit={submitCustomSector}>
            <label htmlFor="custom-sector">添加自选板块</label>
            <div>
              <input
                id="custom-sector"
                value={customSectorName}
                onChange={(event) => setCustomSectorName(event.target.value)}
                placeholder={activeMarket === 'A股' ? '例如：机器人 / 算力' : '例如：AI agents'}
              />
              <button type="submit" aria-label="添加自选板块">
                <Plus size={15} />
              </button>
            </div>
          </form>
        </aside>

        <section className="sector-detail">
          <div className="sector-hero">
            <div>
              <h2>{selectedSector.name}</h2>
              <p>{selectedSector.aiRead}</p>
            </div>
            <div className={`change-pill ${isCustomSelectedSector ? 'flat' : toneFromChange(selectedSector.change)}`}>
              {isCustomSelectedSector ? (
                <Flame size={18} />
              ) : selectedSector.change > 0 ? (
                <ArrowUpRight size={18} />
              ) : (
                <ArrowDownRight size={18} />
              )}
              {isCustomSelectedSector
                ? `热度 ${selectedRadarItem?.heatScore ?? selectedSector.hotScore}`
                : formatChange(selectedSector.change)}
            </div>
          </div>

          <div className="sector-stats">
            {isCustomSelectedSector ? (
              <>
                <Metric
                  label="新闻热度"
                  value={`${selectedRadarItem?.heatScore ?? selectedSector.hotScore}`}
                  tone="flat"
                  compact
                />
                <Metric
                  label="新闻数量"
                  value={`${selectedRadarItem?.newsCount ?? selectedSector.newsCount} 条`}
                  tone="up"
                  compact
                />
                <Metric
                  label="上涨/下跌"
                  value={`涨 ${selectedDirectionStats?.up ?? 0} / 跌 ${selectedDirectionStats?.down ?? 0}`}
                  tone={(selectedDirectionStats?.up ?? 0) >= (selectedDirectionStats?.down ?? 0) ? 'up' : 'down'}
                  compact
                />
                <Metric
                  label="多空比例"
                  value={`${selectedDirectionStats?.upRatio ?? 0}% / ${selectedDirectionStats?.downRatio ?? 0}%`}
                  tone="flat"
                  compact
                />
              </>
            ) : (
              <>
                <Metric
                  label="成交额排名"
                  value={selectedSector.turnoverRank ? `#${selectedSector.turnoverRank}` : '待验证'}
                  tone="flat"
                  compact
                />
                <Metric
                  label="上涨比例"
                  value={
                    selectedSector.totalStocks
                      ? `${selectedSector.advancers}/${selectedSector.totalStocks}`
                      : '待验证'
                  }
                  tone="up"
                  compact
                />
                <Metric
                  label="领涨"
                  value={selectedSector.leaders.length ? selectedSector.leaders.join(' / ') : '待抓取'}
                  tone="up"
                  compact
                />
                <Metric
                  label="领跌"
                  value={selectedSector.laggards.length ? selectedSector.laggards.join(' / ') : '待抓取'}
                  tone="down"
                  compact
                />
              </>
            )}
          </div>

          <div className="news-analysis-grid">
            <div className="news-list-card">
              <div className="panel-header">
                <div>
                  <div className="section-title">
                    <Newspaper size={18} />
                    <span>板块消息</span>
                  </div>
                  <p className="crawler-status">
                    {crawledNewsState?.status === 'ready'
                      ? `${crawledNewsState.source} · ${formatShortChinaTime(
                          crawledNewsState.fetchedAt,
                        )} · ${crawledNewsState.query}`
                      : crawledNewsState?.status === 'error'
                        ? crawledNewsState.error
                        : '默认样例新闻，可手动抓取最新相关新闻'}
                  </p>
                </div>
                <button
                  type="button"
                  className="crawler-action"
                  onClick={crawlSectorNews}
                  disabled={crawledNewsState?.status === 'loading'}
                >
                  <RefreshCw size={14} />
                  {crawledNewsState?.status === 'loading' ? '抓取中' : '抓取新闻'}
                </button>
              </div>
              {visibleNews.map((news) => (
                <a
                  key={news.id}
                  className={`news-row ${selectedNews?.id === news.id ? 'selected' : ''}`}
                  href={news.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setSelectedNewsId(news.id)}
                >
                  <span className="tag">{news.tag}</span>
                  <span className="news-title">{news.title}</span>
                  <span className="news-meta">
                    {news.source} · {news.publishedAt}
                    {analysisCache[news.id] ? ' · 已分析' : ''}
                  </span>
                  <ExternalLink size={16} />
                </a>
              ))}
            </div>

            <article className="analysis-card">
              {selectedNews && (
                <>
                  <div className="analysis-head">
                    <span className="tag">{selectedNews.sectorName}</span>
                    <h3>{selectedNews.title}</h3>
                    <p>{selectedNews.rawSummary}</p>
                    <div className="ticker-row">
                      {selectedNews.relatedTickers.map((ticker) => (
                        <span key={ticker}>{ticker}</span>
                      ))}
                    </div>
                    <div className="source-actions">
                      <a href={selectedNews.sourceUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={15} />
                        打开信息源
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          searchBing(
                            `${selectedNews.sectorName} ${selectedNews.title} ${selectedNews.relatedTickers.join(' ')}`,
                          )
                        }
                      >
                        <Search size={15} />
                        搜索相关新闻
                      </button>
                    </div>
                  </div>

                  {!selectedAnalysis && (
                    <div className="empty-analysis">
                      <Sparkles size={24} />
                      <strong>这条消息还没有做市场验证</strong>
                      <p>
                        为了控制 API 成本，这里先用本地规则判断市场验证。DeepSeek 只在下方提问、
                        反证和简报 agent 明确触发时使用。
                      </p>
                      <button
                        type="button"
                        className="primary-action"
                        onClick={analyzeNews}
                        disabled={loadingId === selectedNews.id}
                      >
                        {loadingId === selectedNews.id ? '分析中...' : '查看市场验证'}
                      </button>
                    </div>
                  )}

                  {selectedAnalysis && (
                    <div className="analysis-result">
                      <div className="result-topline">
                        <ResultBadge
                          label={sentimentLabels[selectedAnalysis.sentiment]}
                          tone={
                            selectedAnalysis.sentiment === 'bullish'
                              ? 'up'
                              : selectedAnalysis.sentiment === 'bearish'
                                ? 'down'
                                : 'flat'
                          }
                        />
                        <ResultBadge
                          label={validationLabels[selectedAnalysis.marketValidation]}
                          tone={
                            selectedAnalysis.marketValidation === 'validated'
                              ? 'up'
                              : selectedAnalysis.marketValidation === 'contradicted'
                                ? 'down'
                                : 'flat'
                          }
                        />
                        <span className="score">影响 {selectedAnalysis.impactScore}/5</span>
                        <span className="score">
                          置信度 {Math.round(selectedAnalysis.confidence * 100)}%
                        </span>
                      </div>
                      <p className="analysis-summary">{selectedAnalysis.summary}</p>
                      <div className="reason-box">
                        <strong>{relationshipLabels[selectedAnalysis.priceActionRelationship]}</strong>
                        <p>{selectedAnalysis.reasoning}</p>
                      </div>
                      <div className="risk-note">
                        <ShieldAlert size={16} />
                        <span>{selectedAnalysis.riskNote}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
              {!selectedNews && (
                <div className="empty-analysis">
                  <Newspaper size={24} />
                  <strong>这个板块还没有新闻</strong>
                  <p>先点左侧板块消息里的“抓取新闻”，再向 DeepSeek 提问。</p>
                </div>
              )}
              <div className="bot-panel">
                <div className="bot-head">
                  <div className="section-title">
                    <MessageCircle size={18} />
                    <span>DeepSeek 新闻问答</span>
                  </div>
                  <span className="muted">仅提交问题时调用 API</span>
                </div>
                <div className="bot-messages" aria-live="polite">
                  {botMessages.length === 0 && (
                    <p className="bot-empty">
                      会读取当前板块最多 10 条新闻和行情上下文。不会因为抓新闻、切板块或打开页面自动调用。
                    </p>
                  )}
                  {botMessages.map((message) => (
                    <div key={message.id} className={`bot-message ${message.role}`}>
                      {message.content}
                    </div>
                  ))}
                  {botError && <div className="bot-error">{botError}</div>}
                </div>
                <form className="bot-form" onSubmit={submitBotQuestion}>
                  <textarea
                    value={botQuestion}
                    onChange={(event) => setBotQuestion(event.target.value)}
                    placeholder="问这个板块的新闻，比如：这些新闻说明资金在买什么？有哪些反证？"
                    aria-label="向 DeepSeek 提问"
                    rows={3}
                  />
                  <button
                    type="submit"
                    disabled={botStatus === 'loading' || !botQuestion.trim()}
                  >
                    <Send size={15} />
                    {botStatus === 'loading' ? '提问中' : '提问'}
                  </button>
                </form>
              </div>
            </article>
          </div>
        </section>
      </section>
    </main>
  )
}

function Metric({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string
  value: string
  tone: 'up' | 'down' | 'flat'
  compact?: boolean
}) {
  return (
    <div className={`metric ${compact ? 'compact' : ''}`}>
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  )
}

function ResultBadge({ label, tone }: { label: string; tone: 'up' | 'down' | 'flat' }) {
  return <span className={`result-badge ${tone}`}>{label}</span>
}

export default App
