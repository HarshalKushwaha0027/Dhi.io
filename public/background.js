// ── State ────────────────────────────────────────────────────────────────────
let currentTabState = { tabId: null, url: null, startTime: null }
const audioTimers = {}
let switchLog = []

// ── Rolling activity buffer — last 30 min of tab visits ──────────────────────
// Each entry: { domain, category, time (secs), timestamp }
// Used exclusively by the spiral detector. Never persisted to storage.
let recentActivity = []

// Spiral state — tracks whether we've already warned this session
let spiralState = {
  warned: false,        // early warning shown in popup
  notified: false,      // Chrome notification sent
  detectedAt: null,     // when the spiral was first detected
  clearedAt: null,      // when the user recovered
}

// ── Default category map ──────────────────────────────────────────────────────
const CATEGORIES = {
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

// ── Content keyword scorer ────────────────────────────────────────────────────
const CONTENT_KEYWORDS = {
  productive: [
    'tutorial','documentation','docs','guide','learn','course','lesson',
    'programming','coding','javascript','python','react','algorithm',
    'engineering','design system','figma','prototype','api','devtools',
    'github','pull request','code review','debugging','research','thesis',
    'lecture','assignment','study','exam','productivity','workflow',
    'project management','sprint','roadmap','architecture','database'
  ],
  neutral: [
    'news','weather','maps','directions','translate','calculator',
    'calendar','schedule','email','inbox','search results','wikipedia',
    'dictionary','reference','how to','faq','support','help center'
  ],
  unproductive: [
    'funny','meme','lol','viral','trending','celebrity','gossip',
    'movie trailer','tv show','anime','episode','watch online','stream',
    'gaming','gameplay','walkthrough','twitch','let\'s play',
    'music video','playlist','shorts','reels','tiktok',
    'shopping','sale','discount','deal','buy now','add to cart',
    'bet','casino','slots','poker','gambling',
    'drama','controversy','exposed','leaked'
  ]
}

function scoreContent(signals) {
  if (!signals) return null
  const text = signals.toLowerCase()
  const scores = { productive: 0, neutral: 0, unproductive: 0 }
  for (const [cat, words] of Object.entries(CONTENT_KEYWORDS)) {
    for (const word of words) {
      if (text.includes(word)) scores[cat] += word.split(' ').length
    }
  }
  const total = scores.productive + scores.neutral + scores.unproductive
  if (total === 0) return null
  const winner = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b)
  const confidence = winner[1] / total
  if (confidence < 0.45) return null
  return { category: winner[0], confidence: Math.round(confidence * 100) }
}

// ── TLD + domain keyword guesser ──────────────────────────────────────────────
const TLD_HINTS = { '.edu': 'productive', '.ac.': 'productive', '.gov': 'neutral' }
const KEYWORD_HINTS = {
  productive: ['docs','doc','wiki','learn','course','courses','academy','university','code','coding','dev','api','git','ide','build','tutorial','tool','office','design','sheet','sheets','cloud','school','class'],
  neutral:    ['mail','search','maps','map','weather','news','bank','finance','calendar','translate','forecast'],
  unproductive: ['game','games','gaming','video','stream','tv','movie','movies','anime','bet','casino','shop','shopping','deal','deals','social','chat','meme','memes','tube','watch']
}

function guessCategory(domain) {
  if (!domain) return null
  for (const [tld, cat] of Object.entries(TLD_HINTS)) {
    if (domain.includes(tld)) return cat
  }
  const base = domain.replace(/\.[a-z]{2,}$/, '')
  const tokens = base.split(/[.\-]/)
  for (const [cat, words] of Object.entries(KEYWORD_HINTS)) {
    if (words.some(w => tokens.includes(w) || domain.includes(w))) return cat
  }
  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDomain(url) {
  if (!url) return null
  try {
    const h = new URL(url).hostname.replace('www.', '').replace('m.', '').toLowerCase()
    if (!h || h === 'newtab' || h === 'extensions') return null
    const parts = h.split('.')
    return parts.length > 2 ? parts.slice(-2).join('.') : h
  } catch { return null }
}

function isIgnored(url) {
  if (!url) return true
  return url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')
}

function getCategory(domain, overrides = {}) {
  if (!domain) return { category: 'neutral', guessed: false, source: 'default' }
  if (overrides[domain]) return { category: overrides[domain], guessed: false, source: 'user' }
  for (const [cat, list] of Object.entries(CATEGORIES)) {
    if (list.some(d => domain.includes(d))) return { category: cat, guessed: false, source: 'domain' }
  }
  const guess = guessCategory(domain)
  if (guess) return { category: guess, guessed: true, source: 'heuristic' }
  return { category: 'neutral', guessed: true, source: 'default' }
}

// ── Spiral detector ───────────────────────────────────────────────────────────

const WINDOW_MS       = 15 * 60 * 1000  // 15-minute rolling window
const HALF_WINDOW_MS  =  7 * 60 * 1000  // split at 7 min for acceleration test
const NOTIFY_DELAY_MS =  5 * 60 * 1000  // notify if spiral persists 5 more min

function pruneBuffer() {
  const cutoff = Date.now() - WINDOW_MS
  recentActivity = recentActivity.filter(e => e.timestamp > cutoff)
}

function detectSpiral() {
  pruneBuffer()
  const now = Date.now()

  // Need at least 5 events to make a meaningful assessment
  if (recentActivity.length < 5) return { spiral: false }

  const unprod = recentActivity.filter(e => e.category === 'unproductive')

  // Signal 1 — Repetition: same unproductive domain visited 2+ times in window
  const domainCounts = {}
  for (const e of unprod) {
    domainCounts[e.domain] = (domainCounts[e.domain] || 0) + 1
  }
  const repeated = Object.values(domainCounts).some(c => c >= 2)
  if (!repeated) return { spiral: false }

  // Signal 2 — Acceleration: more unproductive events in second half vs first half
  const firstHalf  = recentActivity.filter(e => now - e.timestamp > HALF_WINDOW_MS)
  const secondHalf = recentActivity.filter(e => now - e.timestamp <= HALF_WINDOW_MS)
  const firstUnprod  = firstHalf.filter(e => e.category === 'unproductive').length
  const secondUnprod = secondHalf.filter(e => e.category === 'unproductive').length
  const accelerating = secondUnprod > firstUnprod
  if (!accelerating) return { spiral: false }

  // Signal 3 — Drift: ratio of unproductive time is worsening
  const firstTotal   = firstHalf.reduce((s, e) => s + e.time, 0) || 1
  const secondTotal  = secondHalf.reduce((s, e) => s + e.time, 0) || 1
  const firstRatio   = firstHalf.filter(e => e.category === 'unproductive').reduce((s, e) => s + e.time, 0) / firstTotal
  const secondRatio  = secondHalf.filter(e => e.category === 'unproductive').reduce((s, e) => s + e.time, 0) / secondTotal
  const drifting     = secondRatio > firstRatio + 0.1  // at least 10% worse

  if (!drifting) return { spiral: false }

  // All 3 signals fired — identify the spiral domains for the message
  const spiralDomains = Object.entries(domainCounts)
    .filter(([, c]) => c >= 2)
    .sort(([, a], [, b]) => b - a)
    .map(([d]) => d)
    .slice(0, 2)

  return { spiral: true, spiralDomains, secondRatio: Math.round(secondRatio * 100) }
}

// Runs every 2 minutes via alarm
function runSpiralCheck() {
  const result = detectSpiral()

  if (!result.spiral) {
    // Recovery — reset if user was in a spiral but PI is improving
    if (spiralState.warned || spiralState.notified) {
      spiralState = { warned: false, notified: false, detectedAt: null, clearedAt: Date.now() }
      console.log('✅ Spiral cleared — focus recovered')
    }
    return
  }

  const now = Date.now()
  console.log(`🌀 Spiral detected — domains: ${result.spiralDomains.join(', ')}, ${result.secondRatio}% unproductive`)

  if (!spiralState.warned) {
    // Stage 1: set warning flag — popup picks this up on next open
    spiralState.warned = true
    spiralState.detectedAt = now
    console.log('⚠️ Spiral warning set (popup will show badge)')
  }

  if (spiralState.warned && !spiralState.notified) {
    const elapsed = now - (spiralState.detectedAt || now)
    if (elapsed >= NOTIFY_DELAY_MS) {
      // Stage 2: spiral persisted for 5 min → send Chrome notification
      spiralState.notified = true
      const siteList = result.spiralDomains.join(' → ')
      chrome.notifications.create('spiralAlert', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon16.png'),
        title: 'Dhi — Focus spiral detected',
        message: `You've been cycling: ${siteList}. Take a 2-minute break before getting back to work.`
      })
      console.log('🔔 Spiral notification sent')
    }
  }
}

// ── Save time ─────────────────────────────────────────────────────────────────
async function saveTimeSpent(domain, timeInSeconds, weight = 1.0) {
  if (!domain) return
  const weighted = timeInSeconds * weight
  if (weighted < 0.5) return

  const data = await chrome.storage.local.get(['domainStats', 'customCategories', 'hourlyToday'])
  const stats       = data.domainStats      || {}
  const overrides   = data.customCategories || {}
  const hourlyToday = data.hourlyToday      || {}

  const existing = stats[domain]
  const { category, guessed, source } = existing?.source === 'content'
    ? { category: existing.category, guessed: existing.guessed, source: 'content' }
    : getCategory(domain, overrides)

  stats[domain] = {
    time: (existing?.time || 0) + weighted,
    category, guessed, source,
    title: existing?.title || null,
  }

  const hour = new Date().getHours()
  if (!hourlyToday[hour]) hourlyToday[hour] = { productive: 0, neutral: 0, unproductive: 0 }
  hourlyToday[hour][category] = (hourlyToday[hour][category] || 0) + weighted

  // Push into rolling buffer for spiral detection
  recentActivity.push({ domain, category, time: weighted, timestamp: Date.now() })

  await chrome.storage.local.set({ domainStats: stats, hourlyToday })
  console.log(`💾 ${domain} [${category} via ${source}${guessed ? ' •guess' : ''}]: +${weighted.toFixed(1)}s`)
}

// ── Alarms ────────────────────────────────────────────────────────────────────
chrome.alarms.create('keepAlive',   { periodInMinutes: 0.4  })
chrome.alarms.create('spiralCheck', { periodInMinutes: 2    })
chrome.alarms.create('dailyReset',  { when: nextMidnight(), periodInMinutes: 1440 })

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('🔄 SW keepalive ping')
    return
  }

  if (alarm.name === 'spiralCheck') {
    runSpiralCheck()
    return
  }

  if (alarm.name === 'dailyReset') {
    const data = await chrome.storage.local.get(['domainStats', 'history', 'hourlyToday'])
    const todayStats  = data.domainStats  || {}
    const history     = data.history      || {}
    const hourlyToday = data.hourlyToday  || {}

    const todayKey  = new Date().toISOString().split('T')[0]
    const totalTime = Object.values(todayStats).reduce((s, x) => s + (x?.time || 0), 0)

    if (totalTime > 0) {
      history[todayKey] = { domainStats: todayStats, totalTime, hourly: hourlyToday, savedAt: Date.now() }
      const keys = Object.keys(history).sort()
      while (keys.length > 7) delete history[keys.shift()]
    }

    // Reset spiral state at midnight too
    recentActivity = []
    spiralState = { warned: false, notified: false, detectedAt: null, clearedAt: null }

    await chrome.storage.local.set({ domainStats: {}, history, hourlyToday: {} })
    console.log(`🌅 Daily reset — saved ${todayKey} to history`)
  }
})

function nextMidnight() {
  const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime()
}

// ── Tab switches ──────────────────────────────────────────────────────────────
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const now = Date.now()

  switchLog.push(now)
  switchLog = switchLog.filter(t => now - t < 3 * 60 * 1000)
  if (switchLog.length > 10) {
    chrome.notifications.create('switchAlert', {
      type: 'basic', iconUrl: chrome.runtime.getURL('icon16.png'),
      title: 'Dhi — focus check',
      message: 'You switched tabs 10+ times in 3 minutes. Take a breath. 🧘'
    })
    switchLog = []
  }

  if (currentTabState.tabId !== null && currentTabState.startTime !== null) {
    const timeSpent = (now - currentTabState.startTime) / 1000
    const domain = getDomain(currentTabState.url)
    if (domain && !isIgnored(currentTabState.url)) await saveTimeSpent(domain, timeSpent, 1.0)
  }

  try {
    const tab = await chrome.tabs.get(activeInfo.tabId)
    currentTabState = { tabId: activeInfo.tabId, url: tab.url, startTime: now }
    console.log(`👀 Now watching: ${getDomain(tab.url) || 'ignored page'}`)
  } catch (e) {
    console.error('Tab fetch error:', e)
    currentTabState = { tabId: null, url: null, startTime: null }
  }
})

// ── URL navigation within same tab ────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === currentTabState.tabId && changeInfo.url) {
    const now = Date.now()
    const oldDomain = getDomain(currentTabState.url)
    const newDomain = getDomain(changeInfo.url)
    if (oldDomain && oldDomain !== newDomain && currentTabState.startTime) {
      saveTimeSpent(oldDomain, (now - currentTabState.startTime) / 1000, 1.0)
    }
    currentTabState.url = changeInfo.url
    currentTabState.startTime = now
    console.log(`🔀 URL changed → ${newDomain || 'ignored'}`)
  }

  if (changeInfo.audible === true) {
    const domain = getDomain(tab.url)
    if (domain) { audioTimers[tabId] = { domain, startTime: Date.now() }; console.log(`[Audio] ▶ Started: ${domain}`) }
  } else if (changeInfo.audible === false && audioTimers[tabId]) {
    const { domain, startTime } = audioTimers[tabId]
    saveTimeSpent(domain, (Date.now() - startTime) / 1000, 0.3)
    console.log(`[Audio] ⏹ Stopped: ${domain}`)
    delete audioTimers[tabId]
  }
})

// ── Idle detection ────────────────────────────────────────────────────────────
chrome.idle.setDetectionInterval(60)
chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'idle' || newState === 'locked') {
    if (currentTabState.tabId !== null && currentTabState.startTime !== null) {
      const domain = getDomain(currentTabState.url)
      if (domain) await saveTimeSpent(domain, (Date.now() - currentTabState.startTime) / 1000, 1.0)
      currentTabState.startTime = null
    }
    // Also clear spiral buffer on idle — breaks the pattern naturally
    pruneBuffer()
  } else if (newState === 'active') {
    currentTabState.startTime = Date.now()
  }
})

// ── Message bridge ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // ── Content hint from content.js ──────────────────────────────────────────
  if (request.action === 'contentHint') {
    const domain = getDomain(request.url)
    if (!domain) return

    chrome.storage.local.get(['domainStats', 'customCategories'], async (data) => {
      const stats     = data.domainStats      || {}
      const overrides = data.customCategories || {}
      const existing  = stats[domain]

      if (overrides[domain]) return

      const result = scoreContent(request.signals)
      if (!result) return

      const domainResult = getCategory(domain, overrides)
      if (result.category === domainResult.category) {
        if (existing) {
          stats[domain] = { ...existing, title: request.title }
          await chrome.storage.local.set({ domainStats: stats })
        }
        return
      }

      if (existing) {
        stats[domain] = {
          ...existing,
          title: request.title,
          contentSuggestion: result.category,
          contentConfidence: result.confidence,
          category:  domainResult.source === 'heuristic' ? result.category : existing.category,
          guessed:   domainResult.source === 'heuristic' ? true : existing.guessed,
          source:    domainResult.source === 'heuristic' ? 'content' : existing.source,
        }
      } else {
        stats[domain] = {
          time: 0, title: request.title,
          category: result.category, guessed: true, source: 'content',
          contentSuggestion: result.category, contentConfidence: result.confidence,
        }
      }

      await chrome.storage.local.set({ domainStats: stats })
      console.log(`[Content] ${domain} — suggests "${result.category}" (${result.confidence}% confidence)`)
    })
    return true
  }

  // ── Popup stats request ───────────────────────────────────────────────────
  if (request.action === 'getLatestStats') {
    const now = Date.now()
    if (currentTabState.tabId !== null && currentTabState.startTime !== null) {
      const secs = (now - currentTabState.startTime) / 1000
      const domain = getDomain(currentTabState.url)
      saveTimeSpent(domain, secs, 1.0).then(() => {
        currentTabState.startTime = Date.now()
        chrome.storage.local.get(['domainStats'], (data) => {
          sendResponse({
            stats: data.domainStats || {},
            switchCount: switchLog.length,
            spiralWarning: spiralState.warned && !spiralState.notified
              ? { active: true, since: spiralState.detectedAt }
              : { active: false }
          })
        })
      })
    } else {
      chrome.storage.local.get(['domainStats'], (data) => {
        sendResponse({
          stats: data.domainStats || {},
          switchCount: switchLog.length,
          spiralWarning: spiralState.warned && !spiralState.notified
            ? { active: true, since: spiralState.detectedAt }
            : { active: false }
        })
      })
    }
    return true
  }

  // ── Dismiss spiral warning from popup ────────────────────────────────────
  if (request.action === 'dismissSpiral') {
    spiralState.warned    = false
    spiralState.notified  = false
    spiralState.detectedAt = null
    recentActivity = []   // clear the buffer — fresh start
    console.log('🙅 Spiral dismissed by user')
    sendResponse({ ok: true })
    return true
  }
})