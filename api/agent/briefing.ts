import { readJsonBody } from '../_body.js'
import { handleBriefingApi } from '../_server.js'

type VercelRequest = Parameters<typeof readJsonBody>[0] & {
  method?: string
}

type VercelResponse = {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const result = await handleBriefingApi(await readJsonBody(request))

  response.statusCode = result.status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(result.body))
}
