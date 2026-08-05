import React, { useState, useEffect } from 'react'

// ── Mirror of background.js CATEGORIES (display only) ────────────────────────
// If you add a new default site in background.js, add it here too.
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

function defaultCategoryOf(domain) {
  for (const [cat, list] of Object.entries(DEFAULTS)) {
    if (list.includes(domain)) return cat
  }
  return null
}

// Same normalization used in background.js / Popup.jsx
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

// ── Category selector buttons ─────────────────────────────────────────────────
function CategoryPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {CAT_ORDER.map(cat => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          style={{
            fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 6,
            cursor: 'pointer', fontFamily: 'inherit',
            background: value === cat ? CAT_COLOR[cat] + '22' : 'transparent',
            color: value === cat ? CAT_COLOR[cat] : '#6b6b85',
            border: `1px solid ${value === cat ? CAT_COLOR[cat] : '#2a2a3e'}`,
          }}>
          {CAT_TEXT[cat]}
        </button>
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

// ── Main Settings page ────────────────────────────────────────────────────────
export default function Settings() {
  const [overrides, setOverrides]   = useState({})
  const [domainInput, setDomainInput] = useState('')
  const [pickedCat, setPickedCat]   = useState('productive')
  const [status, setStatus]         = useState('loading')
  const [toast, setToast]           = useState(null)

  const isExt = typeof chrome !== 'undefined' && chrome.storage

  useEffect(() => { load() }, [])

  function load() {
    if (isExt) {
      chrome.storage.local.get(['customCategories'], (data) => {
        setOverrides(data.customCategories || {})
        setStatus('ok')
      })
    } else {
      setOverrides({ 'twitter.com': 'productive' }) // dev fallback
      setStatus('ok')
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function addOverride(domainRaw, category) {
    const domain = normalizeDomain(domainRaw)
    if (!domain) {
      showToast('⚠️ Enter a valid domain, e.g. github.com')
      return
    }
    const updated = { ...overrides, [domain]: category }
    setOverrides(updated)
    setDomainInput('')

    if (isExt) {
      await chrome.storage.local.set({ customCategories: updated })
      // Also patch today's live stats if this domain already has time logged today
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
    root: {
      minHeight: '100vh', background: '#13131f', color: '#fff',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      padding: '28px 36px 60px', boxSizing: 'border-box',
      maxWidth: 720, margin: '0 auto',
    },
    header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
    dot: { width: 10, height: 10, borderRadius: '50%', background: '#7C6FFF', boxShadow: '0 0 10px #7C6FFF' },
    title: { fontSize: 20, fontWeight: 700 },
    sub: { fontSize: 13, color: '#6b6b85', marginBottom: 28 },

    card: { background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 12, padding: 20, marginBottom: 22 },
    cardTitle: { fontSize: 13, fontWeight: 700, marginBottom: 4 },
    cardDesc: { fontSize: 12, color: '#6b6b85', marginBottom: 16, lineHeight: 1.5 },

    inputRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
    input: {
      flex: 1, minWidth: 180, background: '#13131f', border: '1px solid #2a2a3e',
      borderRadius: 6, padding: '9px 12px', color: '#fff', fontSize: 13,
      fontFamily: 'inherit', outline: 'none',
    },
    addBtn: {
      background: '#7C6FFF', color: '#fff', border: 'none', borderRadius: 6,
      padding: '9px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    },

    sectionTitle: { fontSize: 11, color: '#6b6b85', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 },

    row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #1e1e2e' },
    domainText: { flex: 1, fontSize: 13, color: '#c5c5d8' },
    removeBtn: {
      fontSize: 11, color: '#6b6b85', background: 'none', border: '1px solid #2a2a3e',
      borderRadius: 5, padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit',
    },

    defGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
    defCol: {},
    defColHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12, fontWeight: 700 },
    defColDot: (color) => ({ width: 7, height: 7, borderRadius: 2, background: color }),
    defItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', fontSize: 12 },
    defItemName: { color: '#9a9ab0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

    empty: { fontSize: 12, color: '#4a4a5e', fontStyle: 'italic', padding: '8px 0' },

    toast: {
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8,
      padding: '10px 20px', fontSize: 13, color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    },
  }

  const overrideEntries = Object.entries(overrides)

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.dot} />
        <span style={s.title}>Dhi.io — Category Settings</span>
      </div>
      <div style={s.sub}>Teach Dhi how to score a site before it's ever tracked.</div>

      {/* Add a site */}
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

      {/* Your overrides */}
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

      {/* Built-in defaults */}
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