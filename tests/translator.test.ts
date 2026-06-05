import { describe, it, expect } from 'vitest'
import {
  detectFormat, normalizeRequest,
  formatAnthropicChunk, formatAnthropicDone,
  formatOpenAIChunk, formatOpenAIDone,
} from '../src/translator.js'

describe('detectFormat', () => {
  it('detects anthropic by path', () => {
    expect(detectFormat('/v1/messages', {})).toBe('anthropic')
  })
  it('detects openai by path', () => {
    expect(detectFormat('/v1/chat/completions', {})).toBe('openai')
  })
  it('detects anthropic by header', () => {
    expect(detectFormat('/v1/chat/completions', { 'anthropic-version': '2023-06-01' })).toBe('anthropic')
  })
})

describe('normalizeRequest', () => {
  it('normalizes anthropic format', () => {
    const result = normalizeRequest(
      { model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: 'Hello' }], system: 'Be helpful', max_tokens: 1024, stream: true },
      'anthropic'
    )
    expect(result).toEqual({ model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: 'Hello' }], system: 'Be helpful', maxTokens: 1024, stream: true, temperature: undefined })
  })

  it('normalizes openai format and extracts system message', () => {
    const result = normalizeRequest(
      { model: 'gpt-4o', messages: [{ role: 'system', content: 'Be helpful' }, { role: 'user', content: 'Hello' }], stream: false },
      'openai'
    )
    expect(result.system).toBe('Be helpful')
    expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }])
    expect(result.stream).toBe(false)
  })
})

describe('formatAnthropicChunk', () => {
  it('formats as Anthropic SSE delta', () => {
    expect(formatAnthropicChunk('Hello')).toBe(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n'
    )
  })
})

describe('formatOpenAIChunk', () => {
  it('contains the text in choices delta', () => {
    const line = formatOpenAIChunk('Hello', 'gpt-4o')
    const parsed = JSON.parse(line.replace('data: ', '').trim())
    expect(parsed.choices[0].delta.content).toBe('Hello')
  })
})
