type JsonRequest = {
  on(event: 'data', listener: (chunk: { toString(encoding?: string): string }) => void): void
  on(event: 'end', listener: () => void): void
  on(event: 'error', listener: (error: Error) => void): void
  destroy(): void
}

export function readJsonBody<T>(request: JsonRequest) {
  return new Promise<T>((resolve, reject) => {
    let body = ''

    request.on('data', (chunk) => {
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
