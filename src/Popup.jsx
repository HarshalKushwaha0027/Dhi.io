import React, { useState, useEffect, useRef } from 'react'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(secs) {
  if (!secs || secs < 60) return `${Math.round(secs || 0)}s`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function getDomain(url) {
  try { 
    return new URL(url).hostname
      .replace('www.', '')
      .replace('m.', '')
      .toLowerCase()
  } catch { return url }
}

const PALETTE = ['#7C6FFF', '#FF6B6B', '#FFD166', '#06D6A0', '#4CC9F0', '#F77F00', '#A8DADC']

const SITE_ICONS = {
  'youtube.com': '▶',
  'github.com': '⌥',
  'twitter.com': '𝕏',
  'x.com': '𝕏',
  'stackoverflow.com': '◈',
  'google.com': '◉',
  'reddit.com': '◎',
  'spotify.com': '♫',
  'netflix.com': '▶',
  'linkedin.com': 'in',
}

function siteIcon(domain) {
  for (const key of Object.keys(SITE_ICONS)) {
    if (domain.includes(key)) return SITE_ICONS[key]
  }
  return domain.slice(0, 2).toUpperCase()
}

// ── Donut chart (pure SVG, no recharts) ──────────────────────────────────────

function DonutChart({ sites, total }) {
  const SIZE = 140
  const R = 54
  const STROKE = 14
  const CX = SIZE / 2
  const CY = SIZE / 2
  const circumference = 2 * Math.PI * R

  let offset = 0
  const slices = sites.map((s, i) => {
    const pct = total > 0 ? s.time / total : 0
    const dash = pct * circumference
    const gap = circumference - dash
    const slice = { ...s, dash, gap, offset, color: PALETTE[i % PALETTE.length] }
    offset += dash
    return slice
  })

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {/* track */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1e1e2e" strokeWidth={STROKE} />
      {slices.map((s, i) => (
        <circle
          key={i}
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={s.color}
          strokeWidth={STROKE}
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={-s.offset}
          strokeLinecap="butt"
          style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px`, transition: 'stroke-dasharray 0.6s ease' }}
        />
      ))}
      {/* center text */}
      <text x={CX} y={CY - 8} textAnchor="middle" fill="#9a9ab0" fontSize="9" fontFamily="monospace">TODAY</text>
      <text x={CX} y={CY + 8} textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="600" fontFamily="monospace">
        {fmt(total)}
      </text>
    </svg>
  )
}

// ── Mini bar ─────────────────────────────────────────────────────────────────

function Bar({ pct, color }) {
  return (
    <div style={{ height: 3, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct * 100)}%`, background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
    </div>
  )
}

// ── Main popup ────────────────────────────────────────────────────────────────

export default function Popup() {
  const [sites, setSites] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading') // 'loading' | 'empty' | 'ok' | 'error'

  useEffect(() => {
    // works both inside real extension AND plain browser (fallback to empty)
    const load = () => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'getLatestStats' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('runtime error:', chrome.runtime.lastError.message)
            setStatus('error')
            return
          }
          processStats(response?.stats || {})
        })
      } else {
        // dev fallback: fake data so you can style in browser
        processStats({
          'github.com': 5400,
          'youtube.com': 3200,
          'localhost:3000': 2800,
          'twitter.com': 900,
          'stackoverflow.com': 600,
        })
      }
    }

    const processStats = (raw) => {
      const entries = Object.entries(raw)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)

      if (entries.length === 0) { setStatus('empty'); return }

      const tot = entries.reduce((sum, [, v]) => sum + v, 0)
      const built = entries.map(([domain, time], i) => ({
        domain: getDomain(domain),
        time,
        color: PALETTE[i % PALETTE.length],
      }))
      setSites(built)
      setTotal(tot)
      setStatus('ok')
    }

    load()
  }, [])

  // ── layout constants ──────────────────────────────────────────────────────
  const W = 360

  const s = {
    root: {
      width: W,
      minHeight: 480,
      background: '#13131f',
      color: '#ffffff',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      fontSize: 13,
      padding: '16px 18px 20px',
      boxSizing: 'border-box',
      userSelect: 'none',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    logoDot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: '#7C6FFF',
      boxShadow: '0 0 8px #7C6FFF',
    },
    logoText: {
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: '0.03em',
      color: '#ffffff',
    },
    pill: {
      fontSize: 11,
      fontWeight: 600,
      background: '#1e1e2e',
      color: '#7C6FFF',
      padding: '3px 10px',
      borderRadius: 20,
      border: '1px solid #2e2e45',
      letterSpacing: '0.04em',
    },
    chartRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      marginBottom: 20,
    },
    statsCol: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    },
    statBox: {
      background: '#1a1a2e',
      border: '1px solid #2a2a3e',
      borderRadius: 10,
      padding: '8px 12px',
    },
    statLabel: { fontSize: 10, color: '#6b6b85', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' },
    statValue: { fontSize: 18, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' },
    divider: { height: 1, background: '#1e1e2e', margin: '0 0 14px' },
    sectionTitle: { fontSize: 10, color: '#6b6b85', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
    siteRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '7px 0',
      borderBottom: '1px solid #1a1a2a',
    },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 7,
      background: '#1e1e2e',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      fontWeight: 700,
      flexShrink: 0,
    },
    siteName: { flex: 1, fontSize: 12, color: '#c5c5d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    siteTime: { fontSize: 12, fontWeight: 600, color: '#fff', fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'right' },
    emptyState: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 300,
      gap: 10,
      color: '#6b6b85',
      textAlign: 'center',
    },
    emptyIcon: { fontSize: 36, marginBottom: 6 },
    emptyTitle: { fontSize: 14, fontWeight: 600, color: '#9a9ab0' },
    emptySub: { fontSize: 12, color: '#6b6b85', maxWidth: 220, lineHeight: 1.6 },
    footer: {
      marginTop: 16,
      display: 'flex',
      justifyContent: 'center',
    },
    clearBtn: {
      fontSize: 11,
      color: '#6b6b85',
      background: 'none',
      border: '1px solid #2a2a3e',
      borderRadius: 6,
      padding: '4px 14px',
      cursor: 'pointer',
    },
  }

  const topSite = sites[0]
  const topPct = total > 0 && topSite ? Math.round((topSite.time / total) * 100) : 0

  const clearData = () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ domainStats: {} }, () => {
        setSites([])
        setTotal(0)
        setStatus('empty')
      })
    }
  }

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logo}>
          <div style={s.logoDot} />
          <span style={s.logoText}>Dhi.io</span>
        </div>
        <span style={s.pill}>LIVE</span>
      </div>

      {status === 'loading' && (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>⏳</div>
          <div style={s.emptyTitle}>Loading...</div>
        </div>
      )}

      {status === 'error' && (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>⚠️</div>
          <div style={s.emptyTitle}>Service worker not responding</div>
          <div style={s.emptySub}>Try reloading the extension from chrome://extensions</div>
        </div>
      )}

      {status === 'empty' && (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>🎯</div>
          <div style={s.emptyTitle}>No data yet</div>
          <div style={s.emptySub}>Browse a few tabs and come back — Focus Analyzer will start tracking automatically.</div>
        </div>
      )}

      {status === 'ok' && (
        <>
          {/* Donut + stat cards */}
          <div style={s.chartRow}>
            <DonutChart sites={sites} total={total} />
            <div style={s.statsCol}>
              <div style={s.statBox}>
                <div style={s.statLabel}>Total time</div>
                <div style={s.statValue}>{fmt(total)}</div>
              </div>
              <div style={s.statBox}>
                <div style={s.statLabel}>Top site</div>
                <div style={{ ...s.statValue, fontSize: 13, color: topSite?.color }}>
                  {topSite?.domain || '—'}
                </div>
              </div>
              <div style={s.statBox}>
                <div style={s.statLabel}>Focus share</div>
                <div style={s.statValue}>{topPct}%</div>
              </div>
            </div>
          </div>

          <div style={s.divider} />

          {/* Site list */}
          <div style={s.sectionTitle}>Top destinations</div>
          {sites.map((site, i) => (
            <div key={site.domain} style={{ ...s.siteRow, borderBottom: i === sites.length - 1 ? 'none' : s.siteRow.borderBottom }}>
              <div style={{ ...s.avatar, color: site.color, border: `1px solid ${site.color}33` }}>
                {siteIcon(site.domain)}
              </div>
              <span style={s.siteName}>{site.domain}</span>
              <Bar pct={total > 0 ? site.time / total : 0} color={site.color} />
              <span style={s.siteTime}>{fmt(site.time)}</span>
            </div>
          ))}

          {/* Footer */}
          <div style={s.footer}>
            <button style={s.clearBtn} onClick={clearData}>Reset today's data</button>
          </div>
        </>
      )}
    </div>
  )
}