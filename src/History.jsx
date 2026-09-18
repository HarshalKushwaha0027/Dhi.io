import React, { useState, useEffect } from 'react'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(secs) {
  if (!secs || secs < 60) return `${Math.round(secs || 0)}s`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function dateKey(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  return d.toISOString().split('T')[0]
}

function dayLabel(key) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const d = new Date(key + 'T12:00:00')
  return days[d.getDay()]
}

function hourLabel(h) {
  const period = h < 12 ? 'am' : 'pm'
  let hh = h % 12
  if (hh === 0) hh = 12
  return `${hh}${period}`
}

function computePI(domainStats) {
  const weights = { productive: 1.0, neutral: 0.5, unproductive: -1.0 }
  const entries = Object.values(domainStats || {})
  const totalTime = entries.reduce((s, x) => s + (x?.time || 0), 0)
  if (totalTime === 0) return 0
  const weighted = entries.reduce((s, x) => {
    const w = weights[x?.category] ?? 0.5
    return s + (x?.time || 0) * w
  }, 0)
  return Math.max(0, Math.min(100, Math.round((weighted / totalTime) * 100)))
}

function piColor(score) {
  if (score >= 75) return '#06D6A0'
  if (score >= 50) return '#FFD166'
  if (score >= 25) return '#F77F00'
  return '#FF6B6B'
}

function piLabel(score) {
  if (score >= 75) return 'Deep focus'
  if (score >= 50) return 'On track'
  if (score >= 25) return 'Scattered'
  return 'Distracted'
}

// ── Fold every stored day's hourly data + today's live hourly data ───────────
// into 24 buckets of { productive, neutral, unproductive } seconds.
function aggregateHourly(history, hourlyToday) {
  const buckets = {}
  for (let h = 0; h < 24; h++) buckets[h] = { productive: 0, neutral: 0, unproductive: 0 }

  const foldIn = (hourlyObj) => {
    Object.entries(hourlyObj || {}).forEach(([hourStr, catTimes]) => {
      const h = Number(hourStr)
      if (!buckets[h]) buckets[h] = { productive: 0, neutral: 0, unproductive: 0 }
      buckets[h].productive   += catTimes?.productive   || 0
      buckets[h].neutral      += catTimes?.neutral      || 0
      buckets[h].unproductive += catTimes?.unproductive || 0
    })
  }

  Object.values(history || {}).forEach(dayEntry => foldIn(dayEntry?.hourly))
  foldIn(hourlyToday)

  return buckets
}

// Minimum aggregated seconds in an hour bucket before we trust its PI —
// avoids one stray 61-second visit at 3am skewing the forecast.
const MIN_SAMPLE_SECONDS = 120

function computeHourlyPI(buckets) {
  return Array.from({ length: 24 }, (_, h) => {
    const b = buckets[h] || { productive: 0, neutral: 0, unproductive: 0 }
    const total = b.productive + b.neutral + b.unproductive
    if (total < MIN_SAMPLE_SECONDS) return { hour: h, total, pi: null }
    const weighted = b.productive * 1.0 + b.neutral * 0.5 + b.unproductive * -1.0
    const pi = Math.max(0, Math.min(100, Math.round((weighted / total) * 100)))
    return { hour: h, total, pi }
  })
}

// ── Focus Forecast — hourly bar chart + best/worst callout ───────────────────
function FocusForecast({ hourlyPIArr }) {
  const withData = hourlyPIArr.filter(h => h.pi !== null)

  if (withData.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#6b6b85', padding: '20px 0', textAlign: 'center', lineHeight: 1.6 }}>
        Forecast needs a bit more data — keep browsing for a day or two and check back.
      </div>
    )
  }

  const best  = withData.reduce((a, b) => a.pi > b.pi ? a : b)
  const worst = withData.reduce((a, b) => a.pi < b.pi ? a : b)

  const W = 640, H = 200
  const PAD = { top: 16, bottom: 26, left: 32, right: 10 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const slot = chartW / 24
  const barW = slot - 2

  return (
    <div>
      <div style={{ fontSize: 13, color: '#c5c5d8', marginBottom: 14, lineHeight: 1.6 }}>
        Your focus peaks around <strong style={{ color: '#06D6A0' }}>{hourLabel(best.hour)}</strong> (avg PI {best.pi})
        {best.hour !== worst.hour && <> · dips around <strong style={{ color: '#FF6B6B' }}>{hourLabel(worst.hour)}</strong> (avg PI {worst.pi})</>}
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        {[0, 25, 50, 75, 100].map(v => {
          const y = PAD.top + chartH * (1 - v / 100)
          return (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#1e1e2e" strokeWidth="1" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fill="#6b6b85" fontSize="9" fontFamily="monospace">{v}</text>
            </g>
          )
        })}

        {hourlyPIArr.map((h, i) => {
          const x = PAD.left + i * slot + 1
          if (h.pi === null) {
            return <rect key={i} x={x} y={PAD.top + chartH - 3} width={barW} height={3} rx={1} fill="#1e1e2e" />
          }
          const barH = Math.max(2, (h.pi / 100) * chartH)
          const color = piColor(h.pi)
          const isBest  = h.hour === best.hour
          const isWorst = h.hour === worst.hour
          return (
            <rect key={i} x={x} y={PAD.top + chartH - barH} width={barW} height={barH} rx={2}
              fill={color} opacity={isBest || isWorst ? 1 : 0.55}
              stroke={isBest ? '#06D6A0' : isWorst ? '#FF6B6B' : 'none'}
              strokeWidth={isBest || isWorst ? 1.5 : 0} />
          )
        })}

        {[0, 6, 12, 18, 23].map(h => (
          <text key={h} x={PAD.left + h * slot + slot / 2} y={H - 8}
            textAnchor="middle" fill="#6b6b85" fontSize="9" fontFamily="monospace">
            {hourLabel(h)}
          </text>
        ))}
      </svg>
    </div>
  )
}

// ── Stacked Bar Chart (daily) ─────────────────────────────────────────────────
function WeeklyChart({ days }) {
  const W = 640
  const H = 260
  const PAD = { top: 20, bottom: 40, left: 48, right: 20 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const maxTime = Math.max(...days.map(d => d.totalTime), 1)
  const barW = Math.floor(chartW / 7) - 8
  const gap  = Math.floor(chartW / 7)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = PAD.top + chartH * (1 - pct)
        return (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
              stroke="#1e1e2e" strokeWidth="1" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end"
              fill="#6b6b85" fontSize="10" fontFamily="monospace">
              {fmt(maxTime * pct)}
            </text>
          </g>
        )
      })}

      {days.map((day, i) => {
        const x = PAD.left + i * gap + (gap - barW) / 2
        const totalH = maxTime > 0 ? (day.totalTime / maxTime) * chartH : 0

        const prod    = day.productiveTime / maxTime * chartH
        const neutral = day.neutralTime   / maxTime * chartH
        const unprod  = day.unproductiveTime / maxTime * chartH

        const isToday = day.key === dateKey(0)

        return (
          <g key={day.key}>
            {unprod > 0 && (
              <rect x={x} y={PAD.top + chartH - unprod}
                width={barW} height={unprod} fill="#FF6B6B" opacity="0.85" />
            )}
            {neutral > 0 && (
              <rect x={x} y={PAD.top + chartH - unprod - neutral}
                width={barW} height={neutral} fill="#FFD166" opacity="0.85" />
            )}
            {prod > 0 && (
              <rect x={x} y={PAD.top + chartH - unprod - neutral - prod}
                width={barW} height={prod} rx="3" fill="#06D6A0" opacity="0.85" />
            )}
            {day.totalTime === 0 && (
              <rect x={x} y={PAD.top + chartH - 4}
                width={barW} height={4} rx="2" fill="#1e1e2e" />
            )}
            {day.totalTime > 0 && (
              <text x={x + barW / 2} y={PAD.top + chartH - totalH - 6}
                textAnchor="middle" fill={piColor(day.pi)}
                fontSize="10" fontWeight="700" fontFamily="monospace">
                {day.pi}
              </text>
            )}
            <text x={x + barW / 2} y={H - 8}
              textAnchor="middle"
              fill={isToday ? '#7C6FFF' : '#6b6b85'}
              fontSize="11" fontWeight={isToday ? '700' : '400'}
              fontFamily="monospace">
              {isToday ? 'Today' : dayLabel(day.key)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── PI trend sparkline ────────────────────────────────────────────────────────
function PISparkline({ days }) {
  const W = 640
  const H = 60
  const PAD = 20
  const chartW = W - PAD * 2
  const chartH = H - PAD

  const points = days.map((d, i) => {
    const x = PAD + (i / 6) * chartW
    const y = PAD + (1 - d.pi / 100) * (chartH - PAD / 2)
    return [x, y]
  })

  const path = points.map((p, i) =>
    (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)
  ).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      <line x1={PAD} x2={W - PAD}
        y1={PAD + (chartH - PAD / 2) * 0.5}
        y2={PAD + (chartH - PAD / 2) * 0.5}
        stroke="#2a2a3e" strokeWidth="1" strokeDasharray="4 3" />

      <path d={path} fill="none" stroke="#7C6FFF" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />

      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3"
          fill={piColor(days[i].pi)} stroke="#13131f" strokeWidth="1.5" />
      ))}
    </svg>
  )
}

// ── Best / Worst day cards ────────────────────────────────────────────────────
function SummaryCards({ days }) {
  const withData = days.filter(d => d.totalTime > 0)
  if (withData.length === 0) return null

  const best  = withData.reduce((a, b) => a.pi > b.pi ? a : b)
  const worst = withData.reduce((a, b) => a.pi < b.pi ? a : b)
  const avgPI = Math.round(withData.reduce((s, d) => s + d.pi, 0) / withData.length)
  const totalWeekTime = withData.reduce((s, d) => s + d.totalTime, 0)

  const s = {
    grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 },
    card: { background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 10, padding: '12px 14px' },
    label: { fontSize: 9, color: '#6b6b85', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 },
    val:   { fontSize: 20, fontWeight: 700, color: '#fff' },
    sub:   { fontSize: 10, color: '#6b6b85', marginTop: 2 },
  }

  return (
    <div style={s.grid}>
      <div style={s.card}>
        <div style={s.label}>Weekly avg PI</div>
        <div style={{...s.val, color: piColor(avgPI)}}>{avgPI}</div>
        <div style={s.sub}>{piLabel(avgPI)}</div>
      </div>
      <div style={s.card}>
        <div style={s.label}>Total screen time</div>
        <div style={s.val}>{fmt(totalWeekTime)}</div>
        <div style={s.sub}>across {withData.length} days</div>
      </div>
      <div style={s.card}>
        <div style={s.label}>Best day</div>
        <div style={{...s.val, color: '#06D6A0'}}>{best.pi}</div>
        <div style={s.sub}>{dayLabel(best.key)} · {fmt(best.totalTime)}</div>
      </div>
      <div style={s.card}>
        <div style={s.label}>Worst day</div>
        <div style={{...s.val, color: '#FF6B6B'}}>{worst.pi}</div>
        <div style={s.sub}>{dayLabel(worst.key)} · {fmt(worst.totalTime)}</div>
      </div>
    </div>
  )
}

// ── Top sites this week ───────────────────────────────────────────────────────
function TopSitesWeek({ days }) {
  const merged = {}
  days.forEach(day => {
    Object.entries(day.domainStats || {}).forEach(([domain, val]) => {
      if (!merged[domain]) merged[domain] = { time: 0, category: val?.category || 'neutral' }
      merged[domain].time += val?.time || 0
    })
  })

  const CAT_COLOR = { productive: '#06D6A0', neutral: '#FFD166', unproductive: '#FF6B6B' }
  const sorted = Object.entries(merged)
    .sort(([, a], [, b]) => b.time - a.time)
    .slice(0, 6)

  const maxTime = sorted[0]?.[1].time || 1

  const s = {
    row:  { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #1a1a2a' },
    name: { flex: 1, fontSize: 13, color: '#c5c5d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    time: { fontSize: 12, fontWeight: 600, color: '#fff', minWidth: 52, textAlign: 'right' },
    pill: (cat) => ({
      fontSize: 9, fontWeight: 700,
      color: CAT_COLOR[cat] || '#9a9ab0',
      border: `1px solid ${CAT_COLOR[cat] || '#9a9ab0'}55`,
      borderRadius: 4, padding: '1px 5px',
    }),
    bar: (pct, color) => ({
      height: 3, width: `${pct * 100}%`,
      background: color, borderRadius: 2,
      transition: 'width 0.6s ease',
    }),
    barTrack: { height: 3, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden', flex: 1 },
  }

  return (
    <div>
      {sorted.map(([domain, val], i) => (
        <div key={domain} style={{...s.row, borderBottom: i === sorted.length - 1 ? 'none' : s.row.borderBottom}}>
          <span style={s.name}>{domain}</span>
          <span style={s.pill(val.category)}>{val.category[0].toUpperCase()}</span>
          <div style={s.barTrack}>
            <div style={s.bar(val.time / maxTime, CAT_COLOR[val.category] || '#7C6FFF')} />
          </div>
          <span style={s.time}>{fmt(val.time)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main History page ─────────────────────────────────────────────────────────
export default function History() {
  const [days, setDays]         = useState([])
  const [hourlyPIArr, setHourlyPIArr] = useState([])
  const [status, setStatus]     = useState('loading')

  useEffect(() => {
    const load = () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['domainStats', 'history', 'hourlyToday'], (data) => {
          buildDays(data.domainStats || {}, data.history || {}, data.hourlyToday || {})
        })
      } else {
        // Dev fallback — includes mock hourly patterns too
        const mockHourly = {
          9:  { productive: 2400, neutral: 300,  unproductive: 200 },
          10: { productive: 2800, neutral: 200,  unproductive: 100 },
          11: { productive: 2200, neutral: 400,  unproductive: 300 },
          14: { productive: 600,  neutral: 300,  unproductive: 2400 },
          15: { productive: 500,  neutral: 200,  unproductive: 2800 },
          20: { productive: 300,  neutral: 100,  unproductive: 1800 },
        }
        buildDays(
          { 'github.com': { time: 5400, category: 'productive' }, 'youtube.com': { time: 3200, category: 'unproductive' } },
          {
            [dateKey(1)]: { domainStats: { 'github.com': { time: 7200, category: 'productive' }, 'twitter.com': { time: 1800, category: 'unproductive' } }, totalTime: 9000, hourly: mockHourly },
            [dateKey(2)]: { domainStats: { 'stackoverflow.com': { time: 4800, category: 'productive' }, 'youtube.com': { time: 5400, category: 'unproductive' } }, totalTime: 10200, hourly: mockHourly },
            [dateKey(3)]: { domainStats: { 'notion.so': { time: 6300, category: 'productive' }, 'reddit.com': { time: 900, category: 'unproductive' } }, totalTime: 7200, hourly: mockHourly },
            [dateKey(4)]: { domainStats: { 'github.com': { time: 3600, category: 'productive' }, 'google.com': { time: 1200, category: 'neutral' } }, totalTime: 4800, hourly: mockHourly },
            [dateKey(5)]: { domainStats: { 'netflix.com': { time: 7200, category: 'unproductive' }, 'youtube.com': { time: 3600, category: 'unproductive' } }, totalTime: 10800, hourly: mockHourly },
            [dateKey(6)]: { domainStats: { 'figma.com': { time: 5400, category: 'productive' }, 'github.com': { time: 3600, category: 'productive' } }, totalTime: 9000, hourly: mockHourly },
          },
          mockHourly
        )
      }
    }

    const buildDays = (todayStats, history, hourlyToday) => {
      const result = []

      for (let i = 6; i >= 0; i--) {
        const key = dateKey(i)
        const isToday = i === 0
        const stats = isToday ? todayStats : (history[key]?.domainStats || {})

        const entries = Object.values(stats)
        const totalTime = entries.reduce((s, x) => s + (x?.time || 0), 0)

        const productiveTime   = entries.filter(x => x?.category === 'productive').reduce((s, x) => s + x.time, 0)
        const neutralTime      = entries.filter(x => x?.category === 'neutral').reduce((s, x) => s + x.time, 0)
        const unproductiveTime = entries.filter(x => x?.category === 'unproductive').reduce((s, x) => s + x.time, 0)

        result.push({
          key, isToday, domainStats: stats, totalTime,
          productiveTime, neutralTime, unproductiveTime,
          pi: computePI(stats),
        })
      }

      const hourlyBuckets = aggregateHourly(history, hourlyToday)
      const hourlyPI = computeHourlyPI(hourlyBuckets)

      setDays(result)
      setHourlyPIArr(hourlyPI)
      setStatus('ok')
    }

    load()
  }, [])

  const s = {
    root: {
      minHeight: '100vh', background: '#13131f', color: '#fff',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      padding: '28px 36px 48px', boxSizing: 'border-box',
      maxWidth: 760, margin: '0 auto',
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
    logo:   { display: 'flex', alignItems: 'center', gap: 10 },
    dot:    { width: 10, height: 10, borderRadius: '50%', background: '#7C6FFF', boxShadow: '0 0 10px #7C6FFF' },
    title:  { fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' },
    sub:    { fontSize: 13, color: '#6b6b85', marginTop: 2 },
    section:{ marginBottom: 28 },
    sectionTitle: { fontSize: 11, color: '#6b6b85', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 },
    divider:{ height: 1, background: '#1e1e2e', margin: '24px 0' },
    legend: { display: 'flex', gap: 20, marginBottom: 12 },
    legendItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9a9ab0' },
    legendDot: (color) => ({ width: 8, height: 8, borderRadius: 2, background: color }),
    center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 },
  }

  if (status === 'loading') {
    return (
      <div style={s.root}>
        <div style={s.center}><div style={{fontSize:36}}>⏳</div><div style={{color:'#9a9ab0'}}>Loading history...</div></div>
      </div>
    )
  }

  const hasAnyData = days.some(d => d.totalTime > 0)

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <div style={s.logo}>
            <div style={s.dot} />
            <span style={s.title}>Dhi.io — Weekly Report</span>
          </div>
          <div style={s.sub}>Your focus patterns over the last 7 days</div>
        </div>
        <span style={{ fontSize: 11, color: '#6b6b85', background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 6, padding: '4px 12px' }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {!hasAnyData ? (
        <div style={s.center}>
          <div style={{fontSize:36}}>📊</div>
          <div style={{fontSize:16,fontWeight:600,color:'#9a9ab0'}}>No history yet</div>
          <div style={{fontSize:13,color:'#6b6b85',maxWidth:300,textAlign:'center',lineHeight:1.6}}>
            Browse for a few days and come back — your weekly patterns will appear here.
          </div>
        </div>
      ) : (
        <>
          <div style={s.section}>
            <div style={s.sectionTitle}>Week at a glance</div>
            <SummaryCards days={days} />
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>Focus forecast</div>
            <FocusForecast hourlyPIArr={hourlyPIArr} />
          </div>

          <div style={s.divider} />

          <div style={s.section}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={s.sectionTitle}>Time breakdown</div>
              <div style={s.legend}>
                <div style={s.legendItem}><div style={s.legendDot('#06D6A0')} />Productive</div>
                <div style={s.legendItem}><div style={s.legendDot('#FFD166')} />Neutral</div>
                <div style={s.legendItem}><div style={s.legendDot('#FF6B6B')} />Unproductive</div>
              </div>
            </div>
            <WeeklyChart days={days} />
          </div>

          <div style={s.divider} />

          <div style={s.section}>
            <div style={s.sectionTitle}>Productivity Index trend</div>
            <PISparkline days={days} />
          </div>

          <div style={s.divider} />

          <div style={s.section}>
            <div style={s.sectionTitle}>Top sites this week</div>
            <TopSitesWeek days={days} />
          </div>
        </>
      )}
    </div>
  )
}