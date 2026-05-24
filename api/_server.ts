import {
  buildContrarianResult,
  buildRadarItem,
  buildRuleBriefing,
  buildSectorNewsQuery,
  dedupeNews,
  defaultRadarSectors,
  type AgentNewsItem,
  type MarketName,
  type RadarItem,
  type RadarSectorInput,
} from '../src/agentRules'

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

type DeepSeekApiResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
  model?: string
  usage?: unknown
}

export type JsonResponse = {
  status: number
  body: unknown
  headers?: Record<string, string>
}

const cache = new Map<string, CacheEntry<unknown>>()
const pending = new Map<string, Promise<unknown>>()

function getCache<T>(key: string) {
  const hit = cache.get(key)

  if (!hit || hit.expiresAt <= Date.now()) return undefined

  return hit.value as T
}

function setCache<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
}

async function memoize<T>(key: string, ttlMs: number, loader: () => Promise<T>) {
  const cached = getCache<T>(key)

  if (cached) return cached

  const existing = pending.get(key) as Promise<T> | undefined

  if (existing) return existing

  const promise = loader().finally(() => pending.delete(key))
  pending.set(key, promise)
  const value = await promise
  setCache(key, value, ttlMs)

  return value
}

function decodeXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim()
}

function stripHtml(value: string) {
  return decodeXmlText(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '))
}

function readXmlTag(item: string, tagName: string) {
  return decodeXmlText(item.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`))?.[1] ?? '')
}

function normalizeQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80)
}

function parseGoogleNewsRss(xml: string, query: string, market: MarketName): AgentNewsItem[] {
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))
    .slice(0, 12)
    .map((match, index) => {
      const item = match[1]
      const rawTitle = readXmlTag(item, 'title')
      const titleParts = rawTitle.split(' - ')
      const source = titleParts.length > 1 ? titleParts.at(-1) ?? 'Google News' : 'Google News'
      const title = titleParts.length > 1 ? titleParts.slice(0, -1).join(' - ') : rawTitle

      return {
        id: `live-${market}-${index}-${title.slice(0, 12)}`,
        title,
        source,
        publishedAt: readXmlTag(item, 'pubDate'),
        tag: '抓取',
        rawSummary: stripHtml(readXmlTag(item, 'description')) || `${query} 相关新闻。`,
        sourceUrl: readXmlTag(item, 'link'),
      }
    })
}

export async function fetchNewsItems(market: MarketName, query: string) {
  const normalizedQuery = normalizeQuery(query)
  const cacheKey = `news:${market}:${normalizedQuery}`

  return memoize(cacheKey, 5 * 60 * 1000, async () => {
    const isChina = market === 'A股'
    const rssUrl = new URL('https://news.google.com/rss/search')
    rssUrl.searchParams.set('q', normalizedQuery)
    rssUrl.searchParams.set('hl', isChina ? 'zh-CN' : 'en-US')
    rssUrl.searchParams.set('gl', isChina ? 'CN' : 'US')
    rssUrl.searchParams.set('ceid', isChina ? 'CN:zh-Hans' : 'US:en')

    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 FinUpdates/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Google News RSS returned ${response.status}`)
    }

    return {
      source: 'Google News RSS',
      query: normalizedQuery,
      fetchedAt: new Date().toISOString(),
      items: dedupeNews(parseGoogleNewsRss(await response.text(), normalizedQuery, market)).slice(0, 8),
      cacheHit: false,
    }
  })
}

export async function buildRadar(market: MarketName, sectors = defaultRadarSectors) {
  const targetSectors = sectors.filter((sector) => sector.market === market)
  const radarItems = await Promise.all(
    targetSectors.map(async (sector) => {
      try {
        const news = await fetchNewsItems(market, buildSectorNewsQuery(market, sector))

        return buildRadarItem(sector, news.items)
      } catch {
        return buildRadarItem(sector, [])
      }
    }),
  )

  return {
    source: 'Crawler + Dedup + Heat Agents',
    market,
    fetchedAt: new Date().toISOString(),
    items: radarItems.sort((a, b) => b.heatScore - a.heatScore),
  }
}

function makeDeepSeekPrompt(kind: 'contrarian' | 'briefing' | 'chat', content: string) {
  const base =
    '你是给朋友群使用的市场新闻雷达助手。只基于提供的新闻和上下文回答；不要编造事实；输出中文；简洁；不构成投资建议。'

  return `${base}\n任务类型：${kind}\n${content}`
}

async function callDeepSeek(content: string, kind: 'contrarian' | 'briefing' | 'chat') {
  const apiKey = process.env.DEEPSEEK_API_KEY

  if (!apiKey) {
    throw new Error('缺少 DEEPSEEK_API_KEY')
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
      temperature: 0.2,
      max_tokens: kind === 'chat' ? 800 : 520,
      stream: false,
      messages: [{ role: 'user', content: makeDeepSeekPrompt(kind, content) }],
    }),
  })
  const json = (await response.json()) as DeepSeekApiResponse

  if (!response.ok) {
    throw new Error(json.error?.message ?? 'DeepSeek API 调用失败')
  }

  return {
    answer: json.choices?.[0]?.message?.content ?? '',
    model: json.model,
    usage: json.usage,
  }
}

function newsContext(news: AgentNewsItem[]) {
  return news
    .slice(0, 10)
    .map(
      (item, index) =>
        `${index + 1}. ${item.title}\n来源：${item.source} · ${item.publishedAt}\n摘要：${item.rawSummary}`,
    )
    .join('\n\n')
}

export async function handleNewsApi(url: URL): Promise<JsonResponse> {
  const market = (url.searchParams.get('market') === '美股' ? '美股' : 'A股') satisfies MarketName
  const query = normalizeQuery(url.searchParams.get('q') ?? url.searchParams.get('sector') ?? '')

  if (!query) {
    return { status: 400, body: { error: 'Missing news query' } }
  }

  return {
    status: 200,
    body: await fetchNewsItems(market, query),
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  }
}

export async function handleRadarApi(url: URL): Promise<JsonResponse> {
  const market = (url.searchParams.get('market') === '美股' ? '美股' : 'A股') satisfies MarketName

  return {
    status: 200,
    body: await memoize(`radar:${market}`, 90 * 1000, () => buildRadar(market)),
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  }
}

export async function handleContrarianApi(payload: {
  sector?: RadarSectorInput
  sectorName?: string
  market?: MarketName
  news?: AgentNewsItem[]
  mode?: 'rules' | 'deepseek'
}): Promise<JsonResponse> {
  const sector =
    payload.sector ??
    ({
      id: payload.sectorName ?? 'custom',
      name: payload.sectorName ?? '自选板块',
      market: payload.market ?? 'A股',
      change: 0,
      hotScore: 50,
    } satisfies RadarSectorInput)
  const ruleResult = buildContrarianResult(sector, payload.news ?? [])

  if (payload.mode !== 'deepseek') {
    return { status: 200, body: { ...ruleResult, mode: 'rules', cacheHit: false } }
  }

  const key = `contrarian:${new Date().toISOString().slice(0, 10)}:${sector.market}:${sector.name}`

  try {
    const ai = await memoize(key, 24 * 60 * 60 * 1000, () =>
      callDeepSeek(
        `板块：${sector.name}\n规则反证：${ruleResult.counterpoints.join('；')}\n新闻：\n${newsContext(payload.news ?? [])}`,
        'contrarian',
      ),
    )

    return { status: 200, body: { ...ruleResult, aiNote: ai.answer, mode: 'deepseek_cached' } }
  } catch (error) {
    return {
      status: 200,
      body: {
        ...ruleResult,
        mode: 'rules',
        degraded: true,
        error: error instanceof Error ? error.message : 'DeepSeek unavailable',
      },
    }
  }
}

export async function handleBriefingApi(payload: {
  radarItems?: RadarItem[]
  mode?: 'rules' | 'deepseek'
}): Promise<JsonResponse> {
  const ruleBriefing = buildRuleBriefing(payload.radarItems ?? [])

  if (payload.mode !== 'deepseek') {
    return { status: 200, body: { ...ruleBriefing, mode: 'rules' } }
  }

  const key = `briefing:${new Date().toISOString().slice(0, 10)}`

  try {
    const ai = await memoize(key, 24 * 60 * 60 * 1000, () =>
      callDeepSeek(
        `请把下面雷达结果改写成 5-8 行朋友群简报：\n${JSON.stringify(payload.radarItems ?? [])}`,
        'briefing',
      ),
    )

    return { status: 200, body: { ...ruleBriefing, briefText: ai.answer || ruleBriefing.briefText, mode: 'deepseek_cached' } }
  } catch (error) {
    return {
      status: 200,
      body: {
        ...ruleBriefing,
        mode: 'rules',
        degraded: true,
        error: error instanceof Error ? error.message : 'DeepSeek unavailable',
      },
    }
  }
}

export async function handleChatApi(payload: {
  question?: string
  market?: MarketName
  sector?: string
  marketContext?: string
  news?: AgentNewsItem[]
}): Promise<JsonResponse> {
  const question = payload.question?.trim().slice(0, 500)

  if (!question) {
    return { status: 400, body: { error: '问题不能为空' } }
  }

  try {
    const result = await callDeepSeek(
      `市场：${payload.market ?? 'A股'}\n板块：${payload.sector ?? '未知'}\n行情：${
        payload.marketContext ?? '未提供'
      }\n新闻：\n${newsContext(payload.news ?? [])}\n用户问题：${question}`,
      'chat',
    )

    return { status: 200, body: result }
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : 'DeepSeek API 调用失败' },
    }
  }
}
