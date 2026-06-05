import type { NormalizedRequest, Message } from './types.js'

export function detectFormat(
  path: string,
  headers: Record<string, string>
): 'anthropic' | 'openai' {
  if (path.includes('/v1/messages')) return 'anthropic'
  if (headers['anthropic-version']) return 'anthropic'
  return 'openai'
}

export function normalizeRequest(body: any, format: 'anthropic' | 'openai'): NormalizedRequest {
  if (format === 'anthropic') {
    return {
      model: body.model,
      messages: body.messages,
      system: body.system,
      stream: body.stream ?? false,
      maxTokens: body.max_tokens,
      temperature: body.temperature,
    }
  }
  const messages: Message[] = body.messages ?? []
  const sysMsg = messages.find((m: Message) => m.role === 'system')
  return {
    model: body.model,
    messages: messages.filter((m: Message) => m.role !== 'system'),
    system: typeof sysMsg?.content === 'string' ? sysMsg.content : undefined,
    stream: body.stream ?? false,
    maxTokens: body.max_tokens,
    temperature: body.temperature,
  }
}

export function formatAnthropicChunk(text: string): string {
  return `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`
}

export function formatAnthropicDone(): string {
  return `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`
}

export function formatOpenAIChunk(text: string, model: string): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-routme', object: 'chat.completion.chunk', model,
    choices: [{ delta: { content: text }, index: 0, finish_reason: null }],
  })}\n\n`
}

export function formatOpenAIDone(): string {
  return 'data: [DONE]\n\n'
}
