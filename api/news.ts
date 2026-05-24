import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleNewsApi } from './_server'

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '', 'https://finupdates.local')
  const result = await handleNewsApi(url)

  response.statusCode = result.status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  Object.entries(result.headers ?? {}).forEach(([key, value]) => response.setHeader(key, value))
  response.end(JSON.stringify(result.body))
}
