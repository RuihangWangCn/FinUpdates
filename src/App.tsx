import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Brain,
  ChevronRight,
  Clock3,
  DatabaseZap,
  LineChart,
  Newspaper,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
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

function formatChange(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function toneFromChange(value: number) {
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
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
  const [activeMarket, setActiveMarket] = useState<Market>('A股')
  const [selectedSectorId, setSelectedSectorId] = useState('cpo')
  const [selectedNewsId, setSelectedNewsId] = useState('n1')
  const [analysisCache, setAnalysisCache] = useState<Record<string, Analysis>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const breadth = marketBreadths.find((item) => item.market === activeMarket)!
  const visibleSectors = useMemo(
    () =>
      sectors
        .filter((sector) => sector.market === activeMarket)
        .sort((a, b) => b.hotScore - a.hotScore),
    [activeMarket],
  )
  const selectedSector =
    visibleSectors.find((sector) => sector.id === selectedSectorId) ?? visibleSectors[0]
  const visibleNews = newsItems.filter(
    (news) => news.market === activeMarket && news.sectorId === selectedSector.id,
  )
  const selectedNews =
    visibleNews.find((news) => news.id === selectedNewsId) ?? visibleNews[0]
  const selectedAnalysis = selectedNews ? analysisCache[selectedNews.id] : undefined

  function switchMarket(market: Market) {
    const firstSector = sectors.find((sector) => sector.market === market)!
    const firstNews = newsItems.find((news) => news.sectorId === firstSector.id)!
    setActiveMarket(market)
    setSelectedSectorId(firstSector.id)
    setSelectedNewsId(firstNews.id)
  }

  function selectSector(sector: Sector) {
    const firstNews = newsItems.find((news) => news.sectorId === sector.id)
    setSelectedSectorId(sector.id)
    if (firstNews) setSelectedNewsId(firstNews.id)
  }

  function analyzeNews() {
    if (!selectedNews || analysisCache[selectedNews.id]) return

    setLoadingId(selectedNews.id)
    window.setTimeout(() => {
      setAnalysisCache((cache) => ({
        ...cache,
        [selectedNews.id]: buildAnalysis(selectedNews, selectedSector, breadth),
      }))
      setLoadingId(null)
    }, 760)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">FinUpdates MVP</p>
          <h1>市场宽度 + 热门板块 + AI 消息归因</h1>
        </div>
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
      </header>

      <section className="summary-grid" aria-label="市场概览">
        <article className="market-card breadth-card">
          <div className="section-title">
            <Activity size={18} />
            <span>{breadth.market} 市场宽度</span>
          </div>
          <div className="breadth-number-row">
            <Metric label="上涨家数" value={breadth.advancers.toLocaleString()} tone="up" />
            <Metric label="下跌家数" value={breadth.decliners.toLocaleString()} tone="down" />
            <Metric label="平盘" value={breadth.unchanged.toLocaleString()} tone="flat" />
          </div>
          <div className="micro-grid">
            {breadth.limitUp !== undefined && (
              <>
                <Metric label="涨停" value={breadth.limitUp.toString()} tone="up" compact />
                <Metric label="跌停" value={breadth.limitDown!.toString()} tone="down" compact />
              </>
            )}
            <Metric label="成交额" value={breadth.turnover} tone="flat" compact />
            {breadth.extra.map((item) => (
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
            {breadth.tradeDate} · {breadth.updateTime}
          </p>
        </article>

        <article className="market-card index-card">
          <div className="section-title">
            <LineChart size={18} />
            <span>主要指数</span>
          </div>
          <div className="index-list">
            {breadth.indices.map((index) => (
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
            <span>产品差异化</span>
          </div>
          <p>
            不只看新闻标题。AI 分析会同时读取当天指数、上涨下跌家数、板块涨跌、
            成交热度和相关个股表现，判断消息是否真的被市场验证。
          </p>
          <div className="status-strip">
            <DatabaseZap size={16} />
            <span>点击新闻后按需调用 DeepSeek，结果缓存复用</span>
          </div>
        </article>
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
            {visibleSectors.map((sector) => (
              <button
                type="button"
                key={sector.id}
                className={`sector-row ${selectedSector.id === sector.id ? 'selected' : ''}`}
                onClick={() => selectSector(sector)}
              >
                <span className="sector-main">
                  <span className="sector-name">{sector.name}</span>
                  <span className="sector-context">
                    {sector.advancers}/{sector.totalStocks} 上涨 · {sector.newsCount} 条消息
                  </span>
                </span>
                <span className="sector-side">
                  <strong className={toneFromChange(sector.change)}>
                    {formatChange(sector.change)}
                  </strong>
                  <span>热度 {sector.hotScore}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="sector-detail">
          <div className="sector-hero">
            <div>
              <h2>{selectedSector.name}</h2>
              <p>{selectedSector.aiRead}</p>
            </div>
            <div className={`change-pill ${toneFromChange(selectedSector.change)}`}>
              {selectedSector.change > 0 ? (
                <ArrowUpRight size={18} />
              ) : (
                <ArrowDownRight size={18} />
              )}
              {formatChange(selectedSector.change)}
            </div>
          </div>

          <div className="sector-stats">
            <Metric label="成交额排名" value={`#${selectedSector.turnoverRank}`} tone="flat" compact />
            <Metric label="上涨比例" value={`${selectedSector.advancers}/${selectedSector.totalStocks}`} tone="up" compact />
            <Metric label="领涨" value={selectedSector.leaders.join(' / ')} tone="up" compact />
            <Metric label="领跌" value={selectedSector.laggards.join(' / ')} tone="down" compact />
          </div>

          <div className="news-analysis-grid">
            <div className="news-list-card">
              <div className="panel-header">
                <div className="section-title">
                  <Newspaper size={18} />
                  <span>板块消息</span>
                </div>
                <span className="muted">点击后再分析</span>
              </div>
              {visibleNews.map((news) => (
                <button
                  key={news.id}
                  type="button"
                  className={`news-row ${selectedNews?.id === news.id ? 'selected' : ''}`}
                  onClick={() => setSelectedNewsId(news.id)}
                >
                  <span className="tag">{news.tag}</span>
                  <span className="news-title">{news.title}</span>
                  <span className="news-meta">
                    {news.source} · {news.publishedAt}
                    {analysisCache[news.id] ? ' · 已分析' : ''}
                  </span>
                  <ChevronRight size={16} />
                </button>
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
                  </div>

                  {!selectedAnalysis && (
                    <div className="empty-analysis">
                      <Sparkles size={24} />
                      <strong>这条消息还没有做行情上下文分析</strong>
                      <p>
                        点击后模拟调用 DeepSeek：输入新闻、市场宽度、指数、板块涨跌、
                        领涨领跌股，再判断它是否被市场验证。
                      </p>
                      <button
                        type="button"
                        className="primary-action"
                        onClick={analyzeNews}
                        disabled={loadingId === selectedNews.id}
                      >
                        {loadingId === selectedNews.id ? '分析中...' : '用 DeepSeek 分析'}
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
