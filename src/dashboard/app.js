const HINTS = {
  claude:   'Open claude.ai → DevTools (F12) → Application → Cookies → copy the sessionKey value',
  gemini:   'Go to aistudio.google.com → Get API key → Create API key → copy it (starts with AIza...)',
  chatgpt:  'Open chatgpt.com → DevTools → Network → any request → copy Authorization header value (without "Bearer ")',
  deepseek: 'Go to platform.deepseek.com → API Keys → Create key → copy it (starts with sk-...)',
  kimi:     'Open kimi.moonshot.cn → DevTools → Network → any request → copy Authorization header value (without "Bearer ")',
}

const providerEl = document.getElementById('add-provider')
const hintEl = document.getElementById('add-hint')
providerEl.addEventListener('change', () => { hintEl.textContent = HINTS[providerEl.value] ?? '' })
hintEl.textContent = HINTS['claude']

document.querySelectorAll('[data-nav]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault()
    const page = link.dataset.nav
    document.querySelectorAll('[data-nav]').forEach(l => l.classList.remove('active'))
    link.classList.add('active')
    document.querySelectorAll('[data-page]').forEach(el => el.classList.remove('active'))
    document.querySelector(`[data-page="${page}"]`).classList.add('active')
    if (page === 'accounts') loadAccounts()
    if (page === 'status')   loadStatus()
    if (page === 'logs')     loadLogs()
    if (page === 'keys')     loadKeys()
  })
})

async function api(path, options = {}) {
  const res = await fetch(path, options)
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText) }
  return res.json()
}

function fmt(iso) { return iso ? new Date(iso).toLocaleString() : '—' }

async function loadAccounts() {
  const accounts = await api('/api/accounts')
  const tbody = document.getElementById('accounts-tbody')
  tbody.innerHTML = accounts.length === 0
    ? '<tr><td colspan="5" class="empty">No accounts yet. Add one above.</td></tr>'
    : accounts.map(a => `<tr>
        <td>${a.provider}</td>
        <td>${a.label}</td>
        <td><span class="badge ${a.status}">${a.status}</span></td>
        <td>${fmt(a.lastUsed)}</td>
        <td style="display:flex;gap:6px">
          <button class="btn-sm" onclick="toggleAccount('${a.id}','${a.status === 'disabled' ? 'active' : 'disabled'}')">
            ${a.status === 'disabled' ? 'Enable' : 'Disable'}
          </button>
          <button class="btn-sm btn-danger" onclick="deleteAccount('${a.id}')">Delete</button>
        </td>
      </tr>`).join('')
}

async function addAccount() {
  const provider = providerEl.value
  const label = document.getElementById('add-label').value.trim()
  const credential = document.getElementById('add-credential').value.trim()
  if (!label || !credential) return alert('Label and credential are required')
  try {
    await api('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, label, credential }),
    })
    document.getElementById('add-label').value = ''
    document.getElementById('add-credential').value = ''
    await loadAccounts()
  } catch (e) { alert(e.message) }
}

async function toggleAccount(id, newStatus) {
  await api(`/api/accounts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  })
  await loadAccounts()
}

async function deleteAccount(id) {
  if (!confirm('Delete this account?')) return
  await api(`/api/accounts/${id}`, { method: 'DELETE' })
  await loadAccounts()
}

async function loadStatus() {
  const status = await api('/api/status')
  const tbody = document.getElementById('status-tbody')
  tbody.innerHTML = status.length === 0
    ? '<tr><td colspan="5" class="empty">No accounts.</td></tr>'
    : status.map(a => `<tr>
        <td>${a.provider}</td>
        <td>${a.label}</td>
        <td><span class="badge ${a.status}">${a.status}</span></td>
        <td>${fmt(a.rateLimitedUntil)}</td>
        <td>${fmt(a.lastUsed)}</td>
      </tr>`).join('')
}

async function loadLogs() {
  const logs = await api('/api/logs')
  const tbody = document.getElementById('logs-tbody')
  tbody.innerHTML = logs.length === 0
    ? '<tr><td colspan="5" class="empty">No requests yet.</td></tr>'
    : logs.map(l => `<tr>
        <td>${fmt(l.timestamp)}</td>
        <td>${l.provider}</td>
        <td>${l.accountLabel}</td>
        <td><span class="badge ${l.status}">${l.status}</span></td>
        <td>${l.latencyMs}ms</td>
      </tr>`).join('')
}

loadAccounts()

// Keys tab
async function loadKeys() {
  const keys = await api('/api/keys')
  const tbody = document.getElementById('keys-tbody')
  tbody.innerHTML = keys.length === 0
    ? '<tr><td colspan="5" class="empty">No keys yet. Generate one above.</td></tr>'
    : keys.map(k => `<tr>
        <td>${k.label}</td>
        <td><code style="font-size:12px;background:#f3f4f6;padding:2px 6px;border-radius:4px">${k.key}</code>
          <button class="btn-sm" onclick="copyKey('${k.key}')" style="margin-left:4px">Copy</button>
        </td>
        <td><span class="badge ${k.enabled ? 'active' : 'disabled'}">${k.enabled ? 'active' : 'disabled'}</span></td>
        <td>${fmt(k.createdAt)}</td>
        <td style="display:flex;gap:6px">
          <button class="btn-sm" onclick="toggleKey('${k.id}',${!k.enabled})">${k.enabled ? 'Disable' : 'Enable'}</button>
          <button class="btn-sm btn-danger" onclick="deleteKey2('${k.id}')">Delete</button>
        </td>
      </tr>`).join('')
}

async function generateKey() {
  const label = document.getElementById('key-label').value.trim()
  if (!label) return alert('Enter a label for the key')
  try {
    const key = await api('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })
    document.getElementById('key-label').value = ''
    await loadKeys()
    alert(`Key generated!\n\n${key.key}\n\nCopy it now — this is the only time it's shown in full.`)
  } catch (e) { alert(e.message) }
}

function copyKey(key) {
  navigator.clipboard.writeText(key).then(() => alert('Copied!')).catch(() => alert('Copy failed — select manually'))
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => alert('Copied!')).catch(() => alert('Copy failed — select manually'))
}

function initConnectionInfo() {
  const base = window.location.origin
  document.getElementById('base-url').textContent = base
  document.getElementById('chat-url').textContent = base + '/v1/chat/completions'
  document.getElementById('models-url').textContent = base + '/v1/models'
}
initConnectionInfo()

async function toggleKey(id, enabled) {
  await api(`/api/keys/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  await loadKeys()
}

async function deleteKey2(id) {
  if (!confirm('Delete this API key? Clients using it will lose access.')) return
  await api(`/api/keys/${id}`, { method: 'DELETE' })
  await loadKeys()
}
