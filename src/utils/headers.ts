const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const BROWSER_BASE = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
}

export function browserHeaders(origin: string, extra?: Record<string, string>): Record<string, string> {
  return {
    ...BROWSER_BASE,
    'Origin': origin,
    'Referer': `${origin}/`,
    'sec-fetch-site': 'same-origin',
    ...extra,
  }
}
