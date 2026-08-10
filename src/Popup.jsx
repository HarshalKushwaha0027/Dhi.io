import React, { useState, useEffect } from 'react'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(secs) {
  if (!secs || secs < 60) return `${Math.round(secs || 0)}s`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function getDomain(url) {
  try {
    const h = new URL(url).hostname.replace('www.', '').replace('m.', '').toLowerCase()
    const parts = h.split('.')
    return parts.length > 2 ? parts.slice(-2).join('.') : h
  } catch { return url }
}

const CAT_COLOR = { productive: '#06D6A0', neutral: '#FFD166', unproductive: '#FF6B6B' }
const CAT_ORDER = ['productive', 'neutral', 'unproductive']

const PALETTE = ['#7C6FFF', '#FF6B6B', '#FFD166', '#06D6A0', '#4CC9F0', '#F77F00', '#A8DADC']

const SITE_ICONS = {
  'youtube.com': '▶', 'github.com': '⌥', 'twitter.com': '𝕏',
  'x.com': '𝕏', 'stackoverflow.com': '◈', 'google.com': '◉',
  'reddit.com': '◎', 'spotify.com': '♫', 'netflix.com': '▶',
  'linkedin.com': 'in', 'notion.so': 'N', 'figma.com': 'F',
}

function siteIcon(domain) {
  for (const key of Object.keys(SITE_ICONS)) {
    if (domain.includes(key)) return SITE_ICONS[key]
  }
  return domain.slice(0, 2).toUpperCase()
}

// ── Productivity Index ────────────────────────────────────────────────────────
function computePI(sites) {
  const weights = { productive: 1.0, neutral: 0.5, unproductive: -1.0 }
  const totalTime = sites.reduce((s, x) => s + x.time, 0)
  if (totalTime === 0) return 0
  const weighted = sites.reduce((s, x) => s + x.time * (weights[x.category] ?? 0.5), 0)
  return Math.max(0, Math.min(100, Math.round((weighted / totalTime) * 100)))
}

function piLabel(score) {
  if (score >= 75) return { text: 'Deep focus', color: '#06D6A0' }
  if (score >= 50) return { text: 'On track', color: '#FFD166' }
  if (score >= 25) return { text: 'Scattered', color: '#F77F00' }
  return { text: 'Distracted', color: '#FF6B6B' }
}

// ── PI Ring ───────────────────────────────────────────────────────────────────
function PIRing({ score }) {
  const R = 38, SIZE = 96, CX = 48, CY = 48
  const circ = 2 * Math.PI * R
  const filled = (score / 100) * circ
  const label = piLabel(score)
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1e1e2e" strokeWidth={8} />
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={label.color}
        strokeWidth={8} strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px`, transition: 'stroke-dasharray 0.8s ease' }} />
      <text x={CX} y={CY - 5} textAnchor="middle" fill="#9a9ab0" fontSize="8" fontFamily="monospace">PI</text>
      <text x={CX} y={CY + 9} textAnchor="middle" fill={label.color} fontSize="15" fontWeight="700" fontFamily="monospace">{score}</text>
    </svg>
  )
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ sites, total }) {
  const R = 50, STROKE = 13, CX = 65, CY = 65, SIZE = 130
  const circumference = 2 * Math.PI * R
  let offset = 0
  const slices = sites.map((s) => {
    const dash = total > 0 ? (s.time / total) * circumference : 0
    const gap = circumference - dash
    const slice = { ...s, dash, gap, offset }
    offset += dash
    return slice
  })
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1e1e2e" strokeWidth={STROKE} />
      {slices.map((s, i) => (
        <circle key={i} cx={CX} cy={CY} r={R} fill="none"
          stroke={s.color} strokeWidth={STROKE}
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={-s.offset} strokeLinecap="butt"
          style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px` }} />
      ))}
      <text x={CX} y={CY - 7} textAnchor="middle" fill="#9a9ab0" fontSize="8" fontFamily="monospace">TODAY</text>
      <text x={CX} y={CY + 8} textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="700" fontFamily="monospace">{fmt(total)}</text>
    </svg>
  )
}

function Bar({ pct, color }) {
  return (
    <div style={{ height: 3, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct * 100)}%`, background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
    </div>
  )
}

// ── Clickable category pill — dashed = guessed, solid = confirmed ────────────
function CatPill({ category, guessed, onClick }) {
  const color = CAT_COLOR[category] || '#9a9ab0'
  const labels = { productive: 'P', neutral: 'N', unproductive: 'U' }
  return (
    <button
      onClick={onClick}
      title={guessed ? 'Guessed — click to confirm or change' : 'Click to recategorize'}
      style={{
        fontSize: 9, fontWeight: 700, color,
        border: `1px ${guessed ? 'dashed' : 'solid'} ${color}${guessed ? '99' : '55'}`,
        borderRadius: 4,
        padding: '1px 4px', letterSpacing: '0.04em', flexShrink: 0,
        background: 'none', cursor: 'pointer', fontFamily: 'inherit',
      }}>{labels[category] || '?'}{guessed ? '?' : ''}</button>
  )
}

// ── Main popup ────────────────────────────────────────────────────────────────
export default function Popup() {
  const [sites, setSites]       = useState([])
  const [total, setTotal]       = useState(0)
  const [pi, setPI]             = useState(0)
  const [switches, setSwitches] = useState(0)
  const [status, setStatus]     = useState('loading')

  useEffect(() => {
    const processStats = (raw, switchCount = 0) => {
      const entries = Object.entries(raw)
        .map(([domain, val]) => ({
          domain: getDomain(domain),
          time:     typeof val === 'object' ? val.time     : val,
          category: typeof val === 'object' ? val.category : 'neutral',
          guessed:  typeof val === 'object' ? !!val.guessed : false,
        }))
        .filter(x => x.time > 0)
        .sort((a, b) => b.time - a.time)
        .slice(0, 6)
        .map((x, i) => ({ ...x, color: PALETTE[i % PALETTE.length] }))

      if (entries.length === 0) { setStatus('empty'); return }

      const tot = entries.reduce((s, x) => s + x.time, 0)
      setSites(entries)
      setTotal(tot)
      setPI(computePI(entries))
      setSwitches(switchCount)
      setStatus('ok')
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'getLatestStats' }, (response) => {
        if (chrome.runtime.lastError) { setStatus('error'); return }
        processStats(response?.stats || {}, response?.switchCount || 0)
      })
    } else {
      processStats({
        'github.com':        { time: 5400, category: 'productive',   guessed: false },
        'youtube.com':       { time: 3200, category: 'unproductive', guessed: false },
        'leetcode.com':      { time: 1800, category: 'productive',   guessed: true  },
        'twitter.com':       { time: 900,  category: 'unproductive', guessed: false },
        'google.com':        { time: 600,  category: 'neutral',      guessed: false },
        'randomblog.io':     { time: 400,  category: 'neutral',      guessed: true  },
      }, 4)
    }
  }, [])

  const topSite = sites[0]
  const piInfo  = piLabel(pi)

  const clearData = () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ domainStats: {} }, () => {
        setSites([]); setTotal(0); setPI(0); setSwitches(0); setStatus('empty')
      })
    }
  }

  const openHistory = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('history.html') })
    }
  }

  const openSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') })
    }
  }

  // Click a pill → cycle category → save override → patch today's stats → update UI
  // Also flips guessed → false, since a click always means "this is confirmed now"
  const cycleCategory = async (domain, currentCat) => {
    const next = CAT_ORDER[(CAT_ORDER.indexOf(currentCat) + 1) % CAT_ORDER.length]

    if (typeof chrome === 'undefined' || !chrome.storage) {
      const updated = sites.map(s => s.domain === domain ? { ...s, category: next, guessed: false } : s)
      setSites(updated)
      setPI(computePI(updated))
      return
    }

    const { customCategories = {} } = await chrome.storage.local.get(['customCategories'])
    customCategories[domain] = next
    await chrome.storage.local.set({ customCategories })

    const { domainStats = {} } = await chrome.storage.local.get(['domainStats'])
    if (domainStats[domain]) {
      domainStats[domain] = { ...domainStats[domain], category: next, guessed: false }
      await chrome.storage.local.set({ domainStats })
    }

    setSites(prev => {
      const updated = prev.map(s => s.domain === domain ? { ...s, category: next, guessed: false } : s)
      setPI(computePI(updated))
      return updated
    })
  }

  const s = {
    root: {
      width: 360, minHeight: 500,
      background: '#13131f', color: '#fff',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      fontSize: 13, padding: '14px 16px 18px', boxSizing: 'border-box', userSelect: 'none',
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    logo:   { display: 'flex', alignItems: 'center', gap: 8 },
    logoDot:{ width: 8, height: 8, borderRadius: '50%', background: '#7C6FFF', boxShadow: '0 0 8px #7C6FFF' },
    logoText:{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.03em' },
    headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
    pill:   { fontSize: 10, fontWeight: 700, background: '#1e1e2e', color: '#7C6FFF', padding: '3px 10px', borderRadius: 20, border: '1px solid #2e2e45' },
    gearBtn:{ background: 'none', border: '1px solid #2a2a3e', borderRadius: 6, color: '#9a9ab0', fontSize: 13, padding: '3px 7px', cursor: 'pointer' },

    topRow:  { display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' },
    rightCol:{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 },

    piCard:  { background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 },
    piLabel: { fontSize: 10, color: '#6b6b85', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 },
    piScore: { fontSize: 18, fontWeight: 700 },
    piDesc:  { fontSize: 11, marginTop: 1 },

    statRow: { display: 'flex', gap: 8 },
    statBox: { flex: 1, background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 10, padding: '7px 10px' },
    statLabel:{ fontSize: 9, color: '#6b6b85', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 },
    statVal:  { fontSize: 15, fontWeight: 700, color: '#fff' },

    divider:      { height: 1, background: '#1e1e2e', margin: '0 0 12px' },
    sectionTitle: { fontSize: 9, color: '#6b6b85', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', justifyContent: 'space-between' },
    hint: { fontSize: 9, color: '#4a4a5e', fontStyle: 'italic' },

    siteRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #1a1a2a' },
    avatar:  { width: 26, height: 26, borderRadius: 6, background: '#1e1e2e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 },
    siteName:{ flex: 1, fontSize: 12, color: '#c5c5d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    siteTime:{ fontSize: 12, fontWeight: 600, color: '#fff', minWidth: 36, textAlign: 'right' },

    center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 10, textAlign: 'center' },
    footer: { marginTop: 14, display: 'flex', justifyContent: 'center', gap: 8 },
    clearBtn:{ fontSize: 11, color: '#6b6b85', background: 'none', border: '1px solid #2a2a3e', borderRadius: 6, padding: '4px 14px', cursor: 'pointer' },
  }

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.logo}><div style={s.logoDot}/><span style={s.logoText}>Dhi.io</span></div>
        <div style={s.headerRight}>
          <button style={s.gearBtn} onClick={openSettings} title="Category settings">⚙</button>
          <span style={s.pill}>LIVE</span>
        </div>
      </div>

      {status === 'loading' && <div style={s.center}><div style={{fontSize:32}}>⏳</div><div style={{fontSize:14,fontWeight:600,color:'#9a9ab0'}}>Loading...</div></div>}
      {status === 'error'   && <div style={s.center}><div style={{fontSize:32}}>⚠️</div><div style={{fontSize:14,fontWeight:600,color:'#9a9ab0'}}>Service worker not responding</div><div style={{fontSize:12,color:'#6b6b85'}}>Reload from chrome://extensions</div></div>}
      {status === 'empty'   && <div style={s.center}><div style={{fontSize:32}}>🎯</div><div style={{fontSize:14,fontWeight:600,color:'#9a9ab0'}}>No data yet</div><div style={{fontSize:12,color:'#6b6b85',maxWidth:220,lineHeight:1.6}}>Browse a few tabs and come back.</div></div>}

      {status === 'ok' && <>
        <div style={s.topRow}>
          <DonutChart sites={sites} total={total} />
          <div style={s.rightCol}>
            <div style={s.piCard}>
              <PIRing score={pi} />
              <div>
                <div style={s.piLabel}>Productivity Index</div>
                <div style={{...s.piScore, color: piInfo.color}}>{pi}<span style={{fontSize:12,fontWeight:400,color:'#6b6b85'}}>/100</span></div>
                <div style={{...s.piDesc, color: piInfo.color}}>{piInfo.text}</div>
              </div>
            </div>
            <div style={s.statRow}>
              <div style={s.statBox}>
                <div style={s.statLabel}>Total time</div>
                <div style={s.statVal}>{fmt(total)}</div>
              </div>
              <div style={s.statBox}>
                <div style={s.statLabel}>Tab switches</div>
                <div style={{...s.statVal, color: switches > 8 ? '#FF6B6B' : '#fff'}}>{switches}<span style={{fontSize:10,color:'#6b6b85'}}>/3m</span></div>
              </div>
            </div>
          </div>
        </div>

        <div style={s.divider} />

        <div style={s.sectionTitle}>
          <span>Top destinations</span>
          <span style={s.hint}>dashed "?" = guessed, click to confirm</span>
        </div>
        {sites.map((site, i) => (
          <div key={site.domain} style={{...s.siteRow, borderBottom: i===sites.length-1?'none':s.siteRow.borderBottom}}>
            <div style={{...s.avatar, color:site.color, border:`1px solid ${site.color}33`}}>{siteIcon(site.domain)}</div>
            <span style={s.siteName}>{site.domain}</span>
            <CatPill category={site.category} guessed={site.guessed} onClick={() => cycleCategory(site.domain, site.category)} />
            <Bar pct={total>0?site.time/total:0} color={site.color} />
            <span style={s.siteTime}>{fmt(site.time)}</span>
          </div>
        ))}

        <div style={s.footer}>
          <button style={s.clearBtn} onClick={clearData}>Reset today's data</button>
          <button style={{...s.clearBtn, color:'#7C6FFF', borderColor:'#7C6FFF55'}} onClick={openHistory}>Weekly report →</button>
        </div>
      </>}
    </div>
  )
}