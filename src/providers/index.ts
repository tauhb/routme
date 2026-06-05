import type { Provider, ProviderId } from '../types.js'
import { ClaudeProvider } from './claude.js'
import { GeminiProvider } from './gemini.js'
import { ChatGPTProvider } from './chatgpt.js'
import { DeepSeekProvider } from './deepseek.js'
import { KimiProvider } from './kimi.js'

const registry = new Map<ProviderId, Provider>([
  ['claude', new ClaudeProvider()],
  ['gemini', new GeminiProvider()],
  ['chatgpt', new ChatGPTProvider()],
  ['deepseek', new DeepSeekProvider()],
  ['kimi', new KimiProvider()],
])

export function getProvider(id: ProviderId): Provider | undefined {
  return registry.get(id)
}
