import React, { useState, useEffect } from 'react'

// ── Mirror of background.js CATEGORIES (display only) ────────────────────────
const DEFAULTS = {
  productive: [
    'github.com','stackoverflow.com','notion.so','figma.com',
    'jira.atlassian.com','docs.google.com','developer.mozilla.org',
    'linear.app','vercel.com','npmjs.com','codepen.io','replit.com',
    'leetcode.com','kaggle.com','coursera.org','udemy.com','freecodecamp.org',
    'medium.com','dev.to','hashnode.com'
  ],
  neutral: [
    'google.com','gmail.com','outlook.com','calendar.google.com',
    'maps.google.com','wikipedia.org','accounts.google.com',
    'drive.google.com','meet.google.com','zoom.us','slack.com'
  ],
  unproductive: [
    'youtube.com','twitter.com','x.com','reddit.com',
    'netflix.com','instagram.com','facebook.com','tiktok.com',
    'twitch.tv','pinterest.com','snapchat.com','discord.com'
  ]
}

const CAT_COLOR = { productive: '#06D6A0', neutral: '#FFD166', unproductive: '#FF6B6B' }
const CAT_ORDER = ['productive', 'neutral', 'unproductive']
const CAT_TEXT  = { productive: 'Productive', neutral: 'Neutral', unproductive: 'Unproductive' }

function normalizeDomain(input) {
  if (!input) return null
  let d = input.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^www\./, '').replace(/^m\./, '')
  d = d.split('/')[0].split('?')[0].split('#')[0]
  const parts = d.split('.')
  if (parts.length > 2) d = parts.slice(-2).join('.')
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return null
  return d
}

function CategoryPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {CAT_ORDER.map(cat => (
        <button key={cat} onClick={() => onChange(cat)}
          style={{
            fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 6,
            cursor: 'pointer', fontFamily: 'inherit',
            background: value === cat ? CAT_COLOR[cat] + '22' : 'transparent',
            color: value === cat ? CAT_COLOR[cat] : '#6b6b85',
            border: `1px solid ${value === cat ? CAT_COLOR[cat] : '#2a2a3e'}`,
          }}>{CAT_TEXT[cat]}</button>
      ))}
    </div>
  )
}

function CatPill({ category, onClick, title }) {
  const color = CAT_COLOR[category] || '#9a9ab0'
  return (
    <button onClick={onClick} title={title}
      style={{
        fontSize: 10, fontWeight: 700, color,
        border: `1px solid ${color}55`, borderRadius: 5,
        padding: '2px 8px', letterSpacing: '0.03em', flexShrink: 0,
        background: 'none', cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit',
      }}>{CAT_TEXT[category] || '?'}</button>
  )
}

// ── Google Gemini API key card (free tier) ────────────────────────────────────
function ApiKeyCard() {
  const [keyInput, setKeyInput] = useState('')
  const [hasKey, setHasKey]     = useState(false)
  const [status, setStatus]     = useState(null) // 'saved' | 'removed' | null
  const isExt = typeof chrome !== 'undefined' && chrome.storage

  useEffect(() => {
    if (isExt) {
      chrome.storage.local.get(['geminiApiKey'], (data) => setHasKey(!!data.geminiApiKey))
    }
  }, [])

  function save() {
    const trimmed = keyInput.trim()
    if (!trimmed) return
    if (isExt) {
      chrome.storage.local.set({ geminiApiKey: trimmed }, () => {
        setHasKey(true); setKeyInput('')
        setStatus('saved'); setTimeout(() => setStatus(null), 2200)
      })
    }
  }

  function remove() {
    if (isExt) {
      chrome.storage.local.remove(['geminiApiKey', 'aiDigest'], () => {
        setHasKey(false)
        setStatus('removed'); setTimeout(() => setStatus(null), 2200)
      })
    }
  }

  const s = {
    card: { background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 12, padding: 20, marginBottom: 22 },
    title: { fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 },
    badge: { fontSize: 9, fontWeight: 700, color: '#06D6A0', background: '#06D6A022', border: '1px solid #06D6A055', borderRadius: 4, padding: '2px 6px' },
    desc: { fontSize: 12, color: '#6b6b85', marginBottom: 14, lineHeight: 1.6 },
    row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    input: { flex: 1, minWidth: 200, background: '#13131f', border: '1px solid #2a2a3e', borderRadius: 6, padding: '9px 12px', color: '#fff', fontSize: 13, fontFamily: 'monospace', outline: 'none' },
    btn: { background: '#7C6FFF', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
    removeBtn: { background: 'none', color: '#FF6B6B', border: '1px solid #FF6B6B55', borderRadius: 6, padding: '9px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
    statusOk: { fontSize: 11, color: '#06D6A0', marginTop: 8 },
    link: { color: '#7C6FFF', textDecoration: 'underline' },
    privacy: { fontSize: 11, color: '#4a4a5e', marginTop: 12, lineHeight: 1.6, borderTop: '1px solid #1e1e2e', paddingTop: 12 },
  }

  return (
    <div style={s.card}>
      <div style={s.title}>
        Google Gemini API key <span style={s.badge}>free · enables AI weekly digest</span>
      </div>
      <div style={s.desc}>
        Add your own free key to get a plain-English written summary of your week on the Weekly Report page.
        Get one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={s.link}>aistudio.google.com/apikey</a> — no credit card needed for the free tier.
      </div>

      {hasKey ? (
        <div style={s.row}>
          <div style={{ ...s.input, color: '#6b6b85', display: 'flex', alignItems: 'center' }}>●●●●●●●●●●●●●●●● (key saved)</div>
          <button style={s.removeBtn} onClick={remove}>Remove key</button>
        </div>
      ) : (
        <div style={s.row}>
          <input
            style={s.input}
            type="password"
            placeholder="AIzaSy..."
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
          />
          <button style={s.btn} onClick={save}>Save key</button>
        </div>
      )}

      {status === 'saved'   && <div style={s.statusOk}>✅ Key saved</div>}
      {status === 'removed' && <div style={s.statusOk}>Key removed</div>}

      <div style={s.privacy}>
        Stored only in this browser's local storage. Sent directly to Google's Gemini API when you click
        "Generate digest" — never to any Dhi server, because there isn't one. Only aggregated numbers
        (scores, categories, site names) are sent, never raw URLs or browsing history. Free tier has
        daily rate limits — see aistudio.google.com/rate-limit for your account's current limits.
      </div>
    </div>
  )
}

// ── Main Settings page ────────────────────────────────────────────────────────
export default function Settings() {
  const [overrides, setOverrides]     = useState({})
  const [domainInput, setDomainInput] = useState('')
  const [pickedCat, setPickedCat]     = useState('productive')
  const [status, setStatus]           = useState('loading')
  const [toast, setToast]             = useState(null)

  const isExt = typeof chrome !== 'undefined' && chrome.storage

  useEffect(() => { load() }, [])

  function load() {
    if (isExt) {
      chrome.storage.local.get(['customCategories'], (data) => {
        setOverrides(data.customCategories || {})
        setStatus('ok')
      })
    } else {
      setOverrides({ 'twitter.com': 'productive' })
      setStatus('ok')
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function addOverride(domainRaw, category) {
    const domain = normalizeDomain(domainRaw)
    if (!domain) { showToast('⚠️ Enter a valid domain, e.g. github.com'); return }
    const updated = { ...overrides, [domain]: category }
    setOverrides(updated)
    setDomainInput('')
    if (isExt) {
      await chrome.storage.local.set({ customCategories: updated })
      const { domainStats = {} } = await chrome.storage.local.get(['domainStats'])
      if (domainStats[domain]) {
        domainStats[domain] = { ...domainStats[domain], category }
        await chrome.storage.local.set({ domainStats })
      }
    }
    showToast(`✅ ${domain} set as ${CAT_TEXT[category]}`)
  }

  async function removeOverride(domain) {
    const updated = { ...overrides }
    delete updated[domain]
    setOverrides(updated)
    if (isExt) await chrome.storage.local.set({ customCategories: updated })
    showToast(`Removed override for ${domain}`)
  }

  function cycleDefault(domain, currentEffective) {
    const next = CAT_ORDER[(CAT_ORDER.indexOf(currentEffective) + 1) % CAT_ORDER.length]
    addOverride(domain, next)
  }

  const s = {
    root: { minHeight: '100vh', background: '#13131f', color: '#fff', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", padding: '28px 36px 60px', boxSizing: 'border-box', maxWidth: 720, margin: '0 auto' },
    header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
    dot: { width: 10, height: 10, borderRadius: '50%', background: '#7C6FFF', boxShadow: '0 0 10px #7C6FFF' },
    title: { fontSize: 20, fontWeight: 700 },
    sub: { fontSize: 13, color: '#6b6b85', marginBottom: 28 },
    card: { background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 12, padding: 20, marginBottom: 22 },
    cardTitle: { fontSize: 13, fontWeight: 700, marginBottom: 4 },
    cardDesc: { fontSize: 12, color: '#6b6b85', marginBottom: 16, lineHeight: 1.5 },
    inputRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    input: { flex: 1, minWidth: 180, background: '#13131f', border: '1px solid #2a2a3e', borderRadius: 6, padding: '9px 12px', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' },
    addBtn: { background: '#7C6FFF', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
    sectionTitle: { fontSize: 11, color: '#6b6b85', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 },
    row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #1e1e2e' },
    domainText: { flex: 1, fontSize: 13, color: '#c5c5d8' },
    removeBtn: { fontSize: 11, color: '#6b6b85', background: 'none', border: '1px solid #2a2a3e', borderRadius: 5, padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit' },
    defGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
    defCol: {},
    defColHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12, fontWeight: 700 },
    defColDot: (color) => ({ width: 7, height: 7, borderRadius: 2, background: color }),
    defItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', fontSize: 12 },
    defItemName: { color: '#9a9ab0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    empty: { fontSize: 12, color: '#4a4a5e', fontStyle: 'italic', padding: '8px 0' },
    toast: { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8, padding: '10px 20px', fontSize: 13, color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' },
  }

  const overrideEntries = Object.entries(overrides)

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.dot} />
        <span style={s.title}>Dhi.io — Settings</span>
      </div>
      <div style={s.sub}>Teach Dhi how to score a site, and set up your AI weekly digest.</div>

      <ApiKeyCard />

      <div style={s.card}>
        <div style={s.cardTitle}>Add or override a site</div>
        <div style={s.cardDesc}>
          Type a domain and pick a category. This takes effect immediately — even for sites you haven't visited yet.
        </div>
        <div style={s.inputRow}>
          <input
            style={s.input}
            placeholder="e.g. leetcode.com"
            value={domainInput}
            onChange={e => setDomainInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addOverride(domainInput, pickedCat) }}
          />
          <CategoryPicker value={pickedCat} onChange={setPickedCat} />
          <button style={s.addBtn} onClick={() => addOverride(domainInput, pickedCat)}>Add</button>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.sectionTitle}>Your custom overrides ({overrideEntries.length})</div>
        {overrideEntries.length === 0 ? (
          <div style={s.empty}>No overrides yet — add one above, or click a category on the built-in list below.</div>
        ) : (
          overrideEntries.map(([domain, cat], i) => (
            <div key={domain} style={{...s.row, borderBottom: i === overrideEntries.length - 1 ? 'none' : s.row.borderBottom}}>
              <span style={s.domainText}>{domain}</span>
              <CatPill category={cat} onClick={() => cycleDefault(domain, cat)} title="Click to cycle" />
              <button style={s.removeBtn} onClick={() => removeOverride(domain)}>Remove</button>
            </div>
          ))
        )}
      </div>

      <div style={s.card}>
        <div style={s.sectionTitle}>Built-in defaults</div>
        <div style={s.defGrid}>
          {CAT_ORDER.map(cat => (
            <div key={cat} style={s.defCol}>
              <div style={s.defColHeader}>
                <div style={s.defColDot(CAT_COLOR[cat])} />
                {CAT_TEXT[cat]}
              </div>
              {DEFAULTS[cat].map(domain => {
                const effective = overrides[domain] || cat
                return (
                  <div key={domain} style={s.defItem}>
                    <span style={s.defItemName} title={domain}>{domain}</span>
                    <CatPill category={effective} onClick={() => cycleDefault(domain, effective)} title="Click to override" />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  )
}