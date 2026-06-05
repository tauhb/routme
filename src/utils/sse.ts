export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
  extract: (eventData: string) => string | null
): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const text = extract(line.slice(6))
      if (text !== null) yield text
    }
  }
}

export async function* parseOpenAISSE(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  yield* parseSSEStream(body, (data) => {
    if (data === '[DONE]') return null
    try {
      const parsed = JSON.parse(data)
      return parsed.choices?.[0]?.delta?.content ?? null
    } catch { return null }
  })
}
