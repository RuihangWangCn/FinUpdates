import { handleRadarApi } from './_server.js'

type VercelRequest = {
  url?: string
}

type VercelResponse = {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const url = new URL(request.url ?? '', 'https://finupdates.local')
  const result = await handleRadarApi(url)

  response.statusCode = result.status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  Object.entries(result.headers ?? {}).forEach(([key, value]) => response.setHeader(key, value))
  response.end(JSON.stringify(result.body))
}
