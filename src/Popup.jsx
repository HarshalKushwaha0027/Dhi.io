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
const PALETTE   = ['#7C6FFF', '#FF6B6B', '#FFD166', '#06D6A0', '#4CC9F0', '#F77F00', '#A8DADC']

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

function computePI(sites) {
  const weights = { productive: 1.0, neutral: 0.5, unproductive: -1.0 }
  const totalTime = sites.reduce((s, x) => s + x.time, 0)
  if (totalTime === 0) return 0
  const weighted = sites.reduce((s, x) => s + x.time * (weights[x.category] ?? 0.5), 0)
  return Math.max(0, Math.min(100, Math.round((weighted / totalTime) * 100)))
}

function piLabel(score) {
  if (score >= 75) return { text: 'Deep focus', color: '#06D6A0' }
  if (score >= 50) return { text: 'On track',   color: '#FFD166' }
  if (score >= 25) return { text: 'Scattered',  color: '#F77F00' }
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
    const slice = { ...s, dash, gap: circumference - dash, offset }
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

function CatPill({ category, guessed, source, onClick }) {
  const color = CAT_COLOR[category] || '#9a9ab0'
  const labels = { productive: 'P', neutral: 'N', unproductive: 'U' }
  const isContent = source === 'content'
  return (
    <button onClick={onClick}
      title={isContent ? 'Content-aware — click to confirm' : guessed ? 'Guessed — click to confirm' : 'Click to recategorize'}
      style={{
        fontSize: 9, fontWeight: 700, color,
        border: `1px ${guessed ? 'dashed' : 'solid'} ${color}${guessed ? '99' : '55'}`,
        borderRadius: 4, padding: '1px 4px', letterSpacing: '0.04em', flexShrink: 0,
        background: 'none', cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 2,
      }}>
      {isContent && <span style={{ fontSize: 8, opacity: 0.8 }}>◈</span>}
      {labels[category] || '?'}{guessed ? '?' : ''}
    </button>
  )
}

function SiteRow({ site, total, onCycle, isLast }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
        borderBottom: isLast && !expanded ? 'none' : '1px solid #1a1a2a',
        cursor: site.title ? 'pointer' : 'default',
      }} onClick={() => site.title && setExpanded(e => !e)}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: '#1e1e2e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, color: site.color, border: `1px solid ${site.color}33` }}>
          {siteIcon(site.domain)}
        </div>
        <span style={{ flex: 1, fontSize: 12, color: '#c5c5d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {site.domain}
        </span>
        <CatPill category={site.category} guessed={site.guessed} source={site.source}
          onClick={(e) => { e.stopPropagation(); onCycle() }} />
        <Bar pct={total > 0 ? site.time / total : 0} color={site.color} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', minWidth: 36, textAlign: 'right' }}>{fmt(site.time)}</span>
      </div>
      {expanded && site.title && (
        <div style={{ fontSize: 10, color: '#6b6b85', padding: '4px 34px 8px', borderBottom: isLast ? 'none' : '1px solid #1a1a2a', lineHeight: 1.5 }}>
          {site.source === 'content' && <span style={{ color: '#7C6FFF', marginRight: 4 }}>◈ content-aware</span>}
          "{site.title}"
        </div>
      )}
    </div>
  )
}

// ── Spiral warning strip ──────────────────────────────────────────────────────
function SpiralWarning({ warning, onDismiss }) {
  if (!warning?.active) return null

  const minutesAgo = warning.since
    ? Math.round((Date.now() - warning.since) / 60000)
    : null

  return (
    <div style={{
      background: '#1a0f00',
      border: '1px solid #F77F0066',
      borderRadius: 8,
      padding: '10px 12px',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
    }}>
      {/* Animated spiral icon */}
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>🌀</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#F77F00', marginBottom: 3 }}>
          Focus spiral detected
        </div>
        <div style={{ fontSize: 11, color: '#9a6b3a', lineHeight: 1.5 }}>
          You're cycling between the same distracting sites
          {minutesAgo !== null && minutesAgo > 0 ? ` for ${minutesAgo}m` : ''}.
          Try switching to something productive for 5 minutes.
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: 'none', border: 'none', color: '#6b6b85',
          fontSize: 14, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0,
        }}
        title="Dismiss — I'm on it">✕</button>
    </div>
  )
}

// ── Main popup ────────────────────────────────────────────────────────────────
export default function Popup() {
  const [sites, setSites]           = useState([])
  const [total, setTotal]           = useState(0)
  const [pi, setPI]                 = useState(0)
  const [switches, setSwitches]     = useState(0)
  const [spiralWarning, setSpiral]  = useState({ active: false })
  const [status, setStatus]         = useState('loading')

  useEffect(() => {
    const processStats = (raw, switchCount = 0, spiral = { active: false }) => {
      const entries = Object.entries(raw)
        .map(([domain, val]) => ({
          domain:   getDomain(domain),
          time:     typeof val === 'object' ? (val.time     || 0) : val,
          category: typeof val === 'object' ? (val.category || 'neutral') : 'neutral',
          guessed:  typeof val === 'object' ? !!val.guessed  : false,
          source:   typeof val === 'object' ? (val.source   || 'domain') : 'domain',
          title:    typeof val === 'object' ? (val.title    || null) : null,
          contentSuggestion: typeof val === 'object' ? (val.contentSuggestion || null) : null,
          contentConfidence: typeof val === 'object' ? (val.contentConfidence || null) : null,
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
      setSpiral(spiral)
      setStatus('ok')
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'getLatestStats' }, (response) => {
        if (chrome.runtime.lastError) { setStatus('error'); return }
        processStats(response?.stats || {}, response?.switchCount || 0, response?.spiralWarning || { active: false })
      })
    } else {
      // Dev fallback — show the spiral warning so you can style it
      processStats({
        'github.com':  { time: 5400, category: 'productive',   guessed: false, source: 'domain', title: null },
        'youtube.com': { time: 3200, category: 'unproductive', guessed: false, source: 'domain', title: null },
        'reddit.com':  { time: 1800, category: 'unproductive', guessed: false, source: 'domain', title: null },
        'twitter.com': { time: 900,  category: 'unproductive', guessed: false, source: 'domain', title: null },
        'google.com':  { time: 600,  category: 'neutral',      guessed: false, source: 'domain', title: null },
        'newsite.io':  { time: 400,  category: 'productive',   guessed: true,  source: 'heuristic', title: null },
      }, 4, { active: true, since: Date.now() - 4 * 60 * 1000 })
    }
  }, [])

  const piInfo = piLabel(pi)

  const clearData = () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ domainStats: {}, hourlyToday: {} }, () => {
        setSites([]); setTotal(0); setPI(0); setSwitches(0)
        setSpiral({ active: false }); setStatus('empty')
      })
    }
  }

  const dismissSpiral = () => {
    setSpiral({ active: false })
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'dismissSpiral' })
    }
  }

  const cycleCategory = async (domain, currentCat) => {
    const next = CAT_ORDER[(CAT_ORDER.indexOf(currentCat) + 1) % CAT_ORDER.length]
    if (typeof chrome === 'undefined' || !chrome.storage) {
      const updated = sites.map(s => s.domain === domain ? { ...s, category: next, guessed: false, source: 'user' } : s)
      setSites(updated); setPI(computePI(updated)); return
    }
    const { customCategories = {} } = await chrome.storage.local.get(['customCategories'])
    customCategories[domain] = next
    await chrome.storage.local.set({ customCategories })
    const { domainStats = {} } = await chrome.storage.local.get(['domainStats'])
    if (domainStats[domain]) {
      domainStats[domain] = { ...domainStats[domain], category: next, guessed: false, source: 'user' }
      await chrome.storage.local.set({ domainStats })
    }
    setSites(prev => {
      const updated = prev.map(s => s.domain === domain ? { ...s, category: next, guessed: false, source: 'user' } : s)
      setPI(computePI(updated)); return updated
    })
  }

  const openHistory  = () => { if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.create({ url: chrome.runtime.getURL('history.html') }) }
  const openSettings = () => { if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') }) }

  const s = {
    root: { width: 360, minHeight: 500, background: '#13131f', color: '#fff', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", fontSize: 13, padding: '14px 16px 18px', boxSizing: 'border-box', userSelect: 'none' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    logo:    { display: 'flex', alignItems: 'center', gap: 8 },
    logoDot: { width: 8, height: 8, borderRadius: '50%', background: '#7C6FFF', boxShadow: '0 0 8px #7C6FFF' },
    logoText:{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.03em' },
    headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
    pill:    { fontSize: 10, fontWeight: 700, background: '#1e1e2e', color: '#7C6FFF', padding: '3px 10px', borderRadius: 20, border: '1px solid #2e2e45' },
    gearBtn: { background: 'none', border: '1px solid #2a2a3e', borderRadius: 6, color: '#9a9ab0', fontSize: 13, padding: '3px 7px', cursor: 'pointer' },
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
    divider:  { height: 1, background: '#1e1e2e', margin: '0 0 12px' },
    sectionTitle: { display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#6b6b85', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
    hint:     { fontSize: 9, color: '#4a4a5e', fontStyle: 'italic' },
    center:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 10, textAlign: 'center' },
    footer:   { marginTop: 14, display: 'flex', justifyContent: 'center', gap: 8 },
    clearBtn: { fontSize: 11, color: '#6b6b85', background: 'none', border: '1px solid #2a2a3e', borderRadius: 6, padding: '4px 14px', cursor: 'pointer' },
  }

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.logo}>
          <div style={s.logoDot}/>
          <span style={s.logoText}>Dhi.io</span>
          {/* Spiral badge in logo area — subtle amber dot when warning active */}
          {spiralWarning?.active && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F77F00', boxShadow: '0 0 6px #F77F00', marginLeft: 2 }} />
          )}
        </div>
        <div style={s.headerRight}>
          <button style={s.gearBtn} onClick={openSettings} title="Category settings">⚙</button>
          <span style={s.pill}>LIVE</span>
        </div>
      </div>

      {status === 'loading' && <div style={s.center}><div style={{fontSize:32}}>⏳</div><div style={{fontSize:14,fontWeight:600,color:'#9a9ab0'}}>Loading...</div></div>}
      {status === 'error'   && <div style={s.center}><div style={{fontSize:32}}>⚠️</div><div style={{fontSize:14,fontWeight:600,color:'#9a9ab0'}}>Service worker not responding</div><div style={{fontSize:12,color:'#6b6b85'}}>Reload from chrome://extensions</div></div>}
      {status === 'empty'   && <div style={s.center}><div style={{fontSize:32}}>🎯</div><div style={{fontSize:14,fontWeight:600,color:'#9a9ab0'}}>No data yet</div><div style={{fontSize:12,color:'#6b6b85',maxWidth:220,lineHeight:1.6}}>Browse a few tabs and come back.</div></div>}

      {status === 'ok' && <>
        {/* Spiral warning — shows above chart when active */}
        <SpiralWarning warning={spiralWarning} onDismiss={dismissSpiral} />

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
          <span style={s.hint}>◈ = content-aware · dashed = unconfirmed</span>
        </div>

        {sites.map((site, i) => (
          <SiteRow key={site.domain} site={site} total={total} isLast={i === sites.length - 1}
            onCycle={() => cycleCategory(site.domain, site.category)} />
        ))}

        <div style={s.footer}>
          <button style={s.clearBtn} onClick={clearData}>Reset today's data</button>
          <button style={{...s.clearBtn, color:'#7C6FFF', borderColor:'#7C6FFF55'}} onClick={openHistory}>Weekly report →</button>
        </div>
      </>}
    </div>
  )
}