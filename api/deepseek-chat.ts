import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from './_body'
import { handleChatApi } from './_server'

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const result = await handleChatApi(await readJsonBody(request))

  response.statusCode = result.status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(result.body))
}
