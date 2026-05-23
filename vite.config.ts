import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promisify } from 'node:util'
import type { Plugin } from 'vite'

type StooqQuote = {
  symbol: string
  date: string
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const eastmoneyTargets = {
  indices:
    'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f14,f2,f3,f4,f6,f104,f105,f106&secids=1.000001,0.399001,0.399006,1.000688',
  sectors:
    'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=8&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f2,f3,f20,f104,f105',
}

const execFileAsync = promisify(execFile)
const tencentIndexNames: Record<string, string> = {
  sh000001: '上证指数',
  sz399001: '深证成指',
  sz399006: '创业板指',
}

type NewsCacheEntry = {
  expiresAt: number
  body: string
}

type DeepSeekNewsItem = {
  title?: string
  source?: string
  publishedAt?: string
  rawSummary?: string
  sourceUrl?: string
}

type DeepSeekRequestBody = {
  question?: string
  market?: string
  sector?: string
  marketContext?: string
  news?: DeepSeekNewsItem[]
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

const newsCache = new Map<string, NewsCacheEntry>()

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

function parseGoogleNewsRss(xml: string, query: string, market: string) {
  const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))

  return items.slice(0, 8).map((match, index) => {
    const item = match[1]
    const rawTitle = readXmlTag(item, 'title')
    const titleParts = rawTitle.split(' - ')
    const source = titleParts.length > 1 ? titleParts.at(-1) ?? 'Google News' : 'Google News'
    const title = titleParts.length > 1 ? titleParts.slice(0, -1).join(' - ') : rawTitle
    const publishedAt = readXmlTag(item, 'pubDate')
    const link = readXmlTag(item, 'link')
    const description = stripHtml(readXmlTag(item, 'description'))

    return {
      id: `live-${market}-${index}-${Buffer.from(title).toString('base64url').slice(0, 10)}`,
      title,
      source,
      publishedAt,
      tag: '抓取',
      rawSummary: description || `${query} 相关新闻，来自 Google News RSS。`,
      sourceUrl: link,
    }
  })
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = ''

    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8')

      if (body.length > 128 * 1024) {
        request.destroy()
        reject(new Error('Request body is too large'))
      }
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

function marketSourceProxy(): Plugin {
  async function handleStooqQuotes(symbols: string[]) {
    const quotes = await Promise.all(
      symbols.map(async (symbol) => {
        const cleanSymbol = symbol.trim().toLowerCase()
        const response = await fetch(
          `https://stooq.com/q/l/?s=${encodeURIComponent(cleanSymbol)}&f=sd2t2ohlcv&h&e=csv`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
          },
        )

        if (!response.ok) {
          throw new Error(`Stooq returned ${response.status}`)
        }

        const csv = await response.text()
        const [, dataLine] = csv.trim().split(/\r?\n/)
        const [rawSymbol, date, time, open, high, low, close, volume] =
          dataLine?.split(',') ?? []

        if (!rawSymbol || rawSymbol === 'N/D' || !date) {
          throw new Error(`No Stooq quote for ${cleanSymbol}`)
        }

        return {
          symbol: rawSymbol,
          date,
          time,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume),
        } satisfies StooqQuote
      }),
    )

    return quotes
  }

  async function handleEastmoney(target: string | null) {
    if (target !== 'indices' && target !== 'sectors') {
      throw new Error('Unknown Eastmoney target')
    }

    const { stdout } = await execFileAsync(
      'curl',
      ['-fsSL', eastmoneyTargets[target]],
      { maxBuffer: 1024 * 1024 },
    )

    return stdout
  }

  async function handleTencentIndices() {
    const symbols = Object.keys(tencentIndexNames)
    const { stdout } = await execFileAsync(
      'curl',
      ['-fsSL', `https://qt.gtimg.cn/q=${symbols.join(',')}`],
      { maxBuffer: 1024 * 1024 },
    )

    const indices = stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const symbol = line.match(/^v_(\w+)=/)?.[1] ?? ''
        const fields = line.match(/="([^"]*)"/)?.[1].split('~') ?? []
        const trade = fields[35]?.split('/') ?? []

        return {
          symbol,
          name: tencentIndexNames[symbol] ?? symbol,
          price: Number(fields[3]) || 0,
          change: Number(fields[32]) || 0,
          changeAmount: Number(fields[31]) || 0,
          turnover: Number(trade[2]) || 0,
          sourceTime: fields[30] ?? '',
        }
      })
      .filter((index) => index.symbol && index.price)

    if (!indices.length) {
      throw new Error('Tencent returned no index quotes')
    }

    return JSON.stringify({ source: '腾讯证券', indices })
  }

  async function handleNewsCrawler(requestUrl: URL) {
    const query = requestUrl.searchParams.get('q')?.trim()
    const market = requestUrl.searchParams.get('market')?.trim() || 'A股'

    if (!query) {
      throw new Error('Missing news query')
    }

    const cacheKey = `${market}:${query}`
    const cached = newsCache.get(cacheKey)

    if (cached && cached.expiresAt > Date.now()) {
      return cached.body
    }

    const isChina = market === 'A股'
    const rssUrl = new URL('https://news.google.com/rss/search')
    rssUrl.searchParams.set('q', query)
    rssUrl.searchParams.set('hl', isChina ? 'zh-CN' : 'en-US')
    rssUrl.searchParams.set('gl', isChina ? 'CN' : 'US')
    rssUrl.searchParams.set('ceid', isChina ? 'CN:zh-Hans' : 'US:en')

    const { stdout } = await execFileAsync(
      'curl',
      [
        '-fsSL',
        '-A',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        rssUrl.toString(),
      ],
      { maxBuffer: 1024 * 1024 },
    )

    const body = JSON.stringify({
      source: 'Google News RSS',
      query,
      fetchedAt: new Date().toISOString(),
      items: parseGoogleNewsRss(stdout, query, market),
    })

    newsCache.set(cacheKey, {
      body,
      expiresAt: Date.now() + 5 * 60 * 1000,
    })

    return body
  }

  async function handleDeepSeekChat(request: IncomingMessage) {
    const apiKey = process.env.DEEPSEEK_API_KEY

    if (!apiKey) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: '缺少 DEEPSEEK_API_KEY。请在启动 dev server 前设置环境变量。',
        }),
      }
    }

    const bodyText = await readRequestBody(request)
    const payload = JSON.parse(bodyText || '{}') as DeepSeekRequestBody
    const question = payload.question?.trim()

    if (!question) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '问题不能为空' }),
      }
    }

    const newsContext = (payload.news ?? [])
      .slice(0, 10)
      .map(
        (item, index) =>
          `${index + 1}. ${item.title ?? '无标题'}\n来源：${item.source ?? '未知'} · ${
            item.publishedAt ?? '未知时间'
          }\n摘要：${item.rawSummary ?? ''}\n链接：${item.sourceUrl ?? ''}`,
      )
      .join('\n\n')

    const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
        temperature: 0.2,
        max_tokens: 800,
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              '你是给朋友群使用的市场新闻问答助手。只基于用户提供的新闻、行情上下文回答；不能编造未提供的事实。回答要简洁、中文、明确区分事实、推断和风险，不构成投资建议。',
          },
          {
            role: 'user',
            content: `市场：${payload.market ?? '未知'}\n板块：${payload.sector ?? '未知'}\n行情上下文：${
              payload.marketContext ?? '未提供'
            }\n\n新闻列表：\n${newsContext || '暂无新闻'}\n\n用户问题：${question}`,
          },
        ],
      }),
    })

    const responseJson = (await deepseekResponse.json()) as DeepSeekApiResponse

    if (!deepseekResponse.ok) {
      return {
        statusCode: deepseekResponse.status,
        body: JSON.stringify({
          error: responseJson?.error?.message ?? 'DeepSeek API 调用失败',
        }),
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        answer: responseJson?.choices?.[0]?.message?.content ?? '',
        model: responseJson?.model,
        usage: responseJson?.usage,
      }),
    }
  }

  async function handleProxyRequest(
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) {
    const requestUrl = new URL(request.url ?? '', 'http://localhost')

    if (requestUrl.pathname === '/api/eastmoney') {
      try {
        const body = await handleEastmoney(requestUrl.searchParams.get('target'))

        response.statusCode = 200
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(body)
      } catch (error) {
        response.statusCode = 502
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unable to load Eastmoney quotes',
          }),
        )
      }
      return
    }

    if (requestUrl.pathname === '/api/a-share-indices') {
      try {
        const body = await handleTencentIndices()

        response.statusCode = 200
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(body)
      } catch (error) {
        response.statusCode = 502
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unable to load Tencent quotes',
          }),
        )
      }
      return
    }

    if (requestUrl.pathname === '/api/news') {
      try {
        const body = await handleNewsCrawler(requestUrl)

        response.statusCode = 200
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(body)
      } catch (error) {
        response.statusCode = 502
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unable to crawl news',
          }),
        )
      }
      return
    }

    if (requestUrl.pathname === '/api/deepseek-chat') {
      if (request.method !== 'POST') {
        response.statusCode = 405
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }

      try {
        const result = await handleDeepSeekChat(request)

        response.statusCode = result.statusCode
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(result.body)
      } catch (error) {
        response.statusCode = 502
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'DeepSeek bot failed',
          }),
        )
      }
      return
    }

    if (requestUrl.pathname === '/api/stooq-quotes') {
      try {
        const symbols = (requestUrl.searchParams.get('symbols') ?? 'spy.us,qqq.us,dia.us,iwm.us')
          .split(',')
          .filter(Boolean)
        const quotes = await handleStooqQuotes(symbols)

        response.statusCode = 200
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(JSON.stringify({ source: 'Stooq', quotes }))
      } catch (error) {
        response.statusCode = 502
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unable to load Stooq quotes',
          }),
        )
      }
      return
    }

    next()
  }

  return {
    name: 'market-source-proxy',
    configureServer(server) {
      server.middlewares.use(handleProxyRequest)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleProxyRequest)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/FinUpdates/',
  plugins: [react(), marketSourceProxy()],
})
