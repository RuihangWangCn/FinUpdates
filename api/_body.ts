import type { IncomingMessage } from 'node:http'

export function readJsonBody<T>(request: IncomingMessage) {
  return new Promise<T>((resolve, reject) => {
    let body = ''

    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8')

      if (body.length > 128 * 1024) {
        request.destroy()
        reject(new Error('Request body is too large'))
      }
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}') as T)
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    request.on('error', reject)
  })
}
