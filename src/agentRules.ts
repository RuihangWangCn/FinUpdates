export type MarketName = 'A股' | '美股'

export type AgentNewsItem = {
  id: string
  title: string
  source: string
  publishedAt: string
  tag?: string
  rawSummary: string
  sourceUrl: string
}

export type RadarSectorInput = {
  id: string
  market: MarketName
  name: string
  change?: number
  hotScore?: number
  leaders?: string[]
}

export type RadarItem = {
  sectorId: string
  sectorName: string
  market: MarketName
  heatScore: number
  newsCount: number
  latestNews?: AgentNewsItem
  topSources: string[]
  riskLabel: string
  summaryStatus: 'rules' | 'ai_cached' | 'needs_news'
  agentNotes: string[]
}

export type ContrarianResult = {
  riskLabel: string
  counterpoints: string[]
  confidence: number
  deepseekSuggested: boolean
}

export type BriefingResult = {
  briefText: string
  watchList: string[]
  riskNotes: string[]
}

const strongKeywords = [
  '爆发',
  '大涨',
  '涨停',
  '新高',
  '订单',
  '上调',
  '突破',
  '集采',
  '扩产',
  'AI',
  '算力',
  '机器人',
]

const riskKeywords = ['回调', '下跌', '减持', '监管', '亏损', '承压', '走弱', '跌停']

export const defaultRadarSectors: RadarSectorInput[] = [
  { id: 'cpo', market: 'A股', name: 'CPO / 光模块', change: 5.82, hotScore: 96, leaders: ['新易盛', '中际旭创'] },
  { id: 'battery', market: 'A股', name: '电池', change: -2.14, hotScore: 84, leaders: ['宁德时代', '亿纬锂能'] },
  { id: '5g', market: 'A股', name: '5G 通信', change: 1.46, hotScore: 72, leaders: ['中兴通讯', '信维通信'] },
  { id: 'robotics', market: 'A股', name: '机器人', change: 0, hotScore: 68, leaders: ['机器人', '人形机器人'] },
  { id: 'ashare-semis', market: 'A股', name: '半导体', change: 0, hotScore: 66, leaders: ['中芯国际', '北方华创'] },
  { id: 'compute', market: 'A股', name: 'AI 算力', change: 0, hotScore: 70, leaders: ['工业富联', '浪潮信息'] },
]

export function buildSectorNewsQuery(market: MarketName, sector: RadarSectorInput) {
  const leaders = (sector.leaders ?? []).slice(0, 2).join(' ')

  return market === 'A股'
    ? `${sector.name} A股 ${leaders}`.trim()
    : `${sector.name} stocks ${leaders}`.trim()
}

export function dedupeNews(items: AgentNewsItem[]) {
  const seen = new Set<string>()

  return items.filter((item) => {
    const normalizedTitle = item.title
      .replace(/[^\p{Script=Han}\p{Letter}\p{Number}]/gu, '')
      .slice(0, 32)
      .toLowerCase()
    const key = `${item.source}:${normalizedTitle}`

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function parseNewsTime(value: string) {
  const time = new Date(value).getTime()

  return Number.isFinite(time) ? time : 0
}

function keywordHits(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(keyword)).length
}

export function scoreNewsHeat(items: AgentNewsItem[], now = Date.now()) {
  const deduped = dedupeNews(items)
  const sources = new Set(deduped.map((item) => item.source).filter(Boolean))
  const recentCount = deduped.filter((item) => {
    const publishedAt = parseNewsTime(item.publishedAt)

    return publishedAt && now - publishedAt <= 24 * 60 * 60 * 1000
  }).length
  const keywordScore = deduped.reduce(
    (score, item) => score + keywordHits(`${item.title} ${item.rawSummary}`, strongKeywords) * 3,
    0,
  )

  return Math.min(100, Math.round(deduped.length * 5 + recentCount * 3 + sources.size * 4 + keywordScore))
}

export function buildContrarianResult(
  sector: RadarSectorInput,
  news: AgentNewsItem[],
): ContrarianResult {
  const deduped = dedupeNews(news)
  const text = deduped.map((item) => `${item.title} ${item.rawSummary}`).join(' ')
  const riskHits = keywordHits(text, riskKeywords)
  const positiveHits = keywordHits(text, strongKeywords)
  const sectorIsWeak = (sector.change ?? 0) < 0
  const noNews = deduped.length === 0
  const counterpoints: string[] = []

  if (noNews) {
    counterpoints.push('还没有抓到足够新闻，暂时不能判断板块热度是否真实。')
  }

  if (sectorIsWeak && positiveHits > 0) {
    counterpoints.push('标题里有利好词，但板块表现偏弱，说明资金可能还没确认。')
  }

  if (riskHits > 0) {
    counterpoints.push('新闻里出现回调、承压或走弱信号，追高前要看后续成交。')
  }

  if (deduped.length > 0 && new Set(deduped.map((item) => item.source)).size <= 2) {
    counterpoints.push('来源集中度偏高，可能只是同一事件被重复转载。')
  }

  if (!counterpoints.length) {
    counterpoints.push('暂时没有明显反证，但仍需要看成交额和龙头持续性。')
  }

  return {
    riskLabel: noNews ? '缺少新闻' : sectorIsWeak || riskHits ? '需要谨慎' : '信号偏强',
    counterpoints,
    confidence: noNews ? 0.38 : Math.min(0.86, 0.52 + deduped.length * 0.04),
    deepseekSuggested: sectorIsWeak || riskHits > 1 || deduped.length >= 6,
  }
}

export function buildRadarItem(sector: RadarSectorInput, news: AgentNewsItem[]): RadarItem {
  const deduped = dedupeNews(news)
  const latestNews = [...deduped].sort((a, b) => parseNewsTime(b.publishedAt) - parseNewsTime(a.publishedAt))[0]
  const topSources = Array.from(new Set(deduped.map((item) => item.source).filter(Boolean))).slice(0, 3)
  const ruleHeat = scoreNewsHeat(deduped)
  const baseHeat = sector.hotScore ?? 0
  const heatScore = Math.max(ruleHeat, Math.round(baseHeat * 0.42 + ruleHeat * 0.58))
  const contrarian = buildContrarianResult(sector, deduped)

  return {
    sectorId: sector.id,
    sectorName: sector.name,
    market: sector.market,
    heatScore,
    newsCount: deduped.length,
    latestNews,
    topSources,
    riskLabel: contrarian.riskLabel,
    summaryStatus: deduped.length ? 'rules' : 'needs_news',
    agentNotes: contrarian.counterpoints.slice(0, 2),
  }
}

export function buildRuleBriefing(radarItems: RadarItem[]): BriefingResult {
  const ranked = [...radarItems].sort((a, b) => b.heatScore - a.heatScore)
  const top = ranked.slice(0, 3)
  const riskItems = ranked.filter((item) => item.riskLabel !== '信号偏强').slice(0, 2)
  const lines = [
    '今日新闻雷达：',
    ...top.map(
      (item, index) =>
        `${index + 1}. ${item.sectorName} 热度 ${item.heatScore}，${item.newsCount} 条新闻，最新关注：${
          item.latestNews?.title ?? '暂无新闻'
        }`,
    ),
  ]

  if (riskItems.length) {
    lines.push(`风险提醒：${riskItems.map((item) => `${item.sectorName}(${item.riskLabel})`).join('、')} 先看验证。`)
  }

  lines.push('仅供朋友群信息整理，不构成投资建议。')

  return {
    briefText: lines.join('\n'),
    watchList: top.map((item) => item.sectorName),
    riskNotes: riskItems.flatMap((item) => item.agentNotes.slice(0, 1)),
  }
}
