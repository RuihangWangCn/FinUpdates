import { handleStooqQuotesApi } from './_server.js'

type VercelRequest = {
  url?: string
}

type VercelResponse = {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const result = await handleStooqQuotesApi(new URL(request.url ?? '', 'https://finupdates.local'))

    response.statusCode = result.status
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    Object.entries(result.headers ?? {}).forEach(([key, value]) => response.setHeader(key, value))
    response.end(JSON.stringify(result.body))
  } catch (error) {
    response.statusCode = 502
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unable to load Stooq quotes',
      }),
    )
  }
}
