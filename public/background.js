// ── State ────────────────────────────────────────────────────────────────────
let currentTabState = { tabId: null, url: null, startTime: null }
const audioTimers = {}
let switchLog = []
let sessionSwitchBuffer = []

// ── Rolling activity buffer — last 15 min of tab visits ───────────────────────
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

// ── Category resolution ─────────────────────────────────────────────────────
// source values: 'user' (settings override, locked) | 'domain' (hardcoded list,
// locked) | 'default' (unknown, open to content-tagging and model prediction)
function getCategory(domain, overrides = {}) {
  if (!domain) return { category: 'neutral', guessed: false, source: 'default' }
  if (overrides[domain]) return { category: overrides[domain], guessed: false, source: 'user' }
  for (const [cat, list] of Object.entries(CATEGORIES)) {
    if (list.some(d => domain.includes(d))) return { category: cat, guessed: false, source: 'domain' }
  }
  return { category: 'neutral', guessed: true, source: 'default' }
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

// ── Behavioral classifier — feature engineering ──────────────────────────────
// Groups sessionLog by domain, computes per-domain aggregates for any domain
// with 5+ sessions.

const MIN_SESSIONS_FOR_FEATURES = 5

function computeDomainFeatures(sessionLog) {
  const byDomain = {}
  for (const s of sessionLog) {
    if (!byDomain[s.domain]) byDomain[s.domain] = []
    byDomain[s.domain].push(s)
  }

  const features = {}
  for (const [domain, sessions] of Object.entries(byDomain)) {
    if (sessions.length < MIN_SESSIONS_FOR_FEATURES) continue

    const n = sessions.length
    const avgDuration = sessions.reduce((s, x) => s + x.duration, 0) / n
    const avgSwitches = sessions.reduce((s, x) => s + x.switches, 0) / n
    const spiralRate  = sessions.filter(x => x.spiral).length / n
    const audioRate   = sessions.filter(x => x.audio).length / n

    features[domain] = {
      sessions: n,
      avgDuration,             // seconds
      switchRate: avgSwitches, // avg nearby switches per session
      spiralRate,              // 0–1, fraction of sessions flagged as spiral
      audioRate,               // 0–1, fraction of sessions with audio
    }
  }
  return features
}

// ── Behavioral classifier — training pipeline ────────────────────────────────

const CATEGORY_TARGET = { productive: 1.0, neutral: 0.5, unproductive: 0.0 }
const REFIT_EVERY = 10
const MIN_TRAINING_DOMAINS = 4  // guard — don't fit on too little data

// Splits feature-eligible domains into:
//   training  — locked domains (hardcoded list or user-confirmed): these are the labels
//   candidates — still-open domains the model is allowed to predict for
//
// Locking rule: only 'domain' (hardcoded list) and 'user' (manually confirmed
// via the pill click-to-cycle in Popup.jsx/Settings.jsx) are locked out of
// prediction. A 'content' tag is NOT a lock — once a domain crosses 5+ sessions,
// the model automatically takes over and sets source: 'model', overwriting the
// earlier content-based guess. The user can always override either one manually
// via the same pill click, which sets source: 'user' and removes it from
// candidates for good.
function splitTrainingAndCandidates(features, overrides) {
  const training = []    // { domain, x: [avgDuration, switchRate, spiralRate, audioRate], y }
  const candidates = []  // { domain, x: [...] }

  for (const [domain, f] of Object.entries(features)) {
    const { category, source } = getCategory(domain, overrides)
    const x = [f.avgDuration, f.switchRate, f.spiralRate, f.audioRate]

    if (source === 'domain' || source === 'user') {
      training.push({ domain, x, y: CATEGORY_TARGET[category] })
    } else if (source === 'default') {
      candidates.push({ domain, x })
    }
  }
  return { training, candidates }
}

function fitNormalizer(trainingX) {
  const d = trainingX[0].length
  const mean = new Array(d).fill(0)
  const std  = new Array(d).fill(0)
  const n = trainingX.length

  for (const x of trainingX) for (let j = 0; j < d; j++) mean[j] += x[j] / n
  for (const x of trainingX) for (let j = 0; j < d; j++) std[j] += (x[j] - mean[j]) ** 2 / n
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1  // avoid /0 if a feature has no variance

  return { mean, std }
}

function applyNormalizer(x, { mean, std }) {
  return x.map((v, j) => (v - mean[j]) / std[j])
}

// Ridge-regularized gradient descent — plain JS, no deps
function trainModel(X, y, { epochs = 500, lr = 0.05, lambda = 0.1 } = {}) {
  const n = X.length, d = X[0].length
  let weights = new Array(d).fill(0)
  let bias = 0

  for (let e = 0; e < epochs; e++) {
    const gradW = new Array(d).fill(0)
    let gradB = 0
    for (let i = 0; i < n; i++) {
      const pred = X[i].reduce((s, v, j) => s + v * weights[j], bias)
      const err = pred - y[i]
      for (let j = 0; j < d; j++) gradW[j] += err * X[i][j]
      gradB += err
    }
    for (let j = 0; j < d; j++) weights[j] -= lr * (gradW[j] / n + lambda * weights[j])
    bias -= lr * (gradB / n)
  }
  return { weights, bias }
}

function predict(x, model) {
  const raw = x.reduce((s, v, j) => s + v * model.weights[j], model.bias)
  return Math.max(0, Math.min(1, raw))  // clamp to [0,1]
}

async function runTrainingPipeline() {
  const { sessionLog = [], customCategories = {} } =
    await chrome.storage.local.get(['sessionLog', 'customCategories'])

  const features = computeDomainFeatures(sessionLog)
  const { training, candidates } = splitTrainingAndCandidates(features, customCategories)

  if (training.length < MIN_TRAINING_DOMAINS || candidates.length === 0) {
    console.log(`🧠 Skipping fit — ${training.length} training domains, ${candidates.length} candidates`)
    return
  }

  const normalizer = fitNormalizer(training.map(t => t.x))
  const X = training.map(t => applyNormalizer(t.x, normalizer))
  const y = training.map(t => t.y)
  const model = trainModel(X, y)

  const { domainStats = {} } = await chrome.storage.local.get(['domainStats'])
  const updatedStats = { ...domainStats }
  for (const c of candidates) {
    const score = predict(applyNormalizer(c.x, normalizer), model)
    const predictedCategory = score > 0.67 ? 'productive' : score > 0.33 ? 'neutral' : 'unproductive'
    const existing = updatedStats[c.domain]
    updatedStats[c.domain] = {
      ...(existing || { time: 0, title: null }),
      category: predictedCategory,
      guessed: true,
      source: 'model',
      modelScore: Math.round(score * 100),
    }
  }

  await chrome.storage.local.set({
    domainStats: updatedStats,
    mlModel: { weights: model.weights, bias: model.bias, normalizer, trainedAt: Date.now(), trainingCount: training.length },
  })
  console.log(`🧠 Refit complete — ${training.length} training domains, predicted ${candidates.length}`)
}

// ── Save time ─────────────────────────────────────────────────────────────────

async function logSession(domain, duration, category, nearbySwitches, spiralFlag, isAudio) {
  const { sessionLog = [] } = await chrome.storage.local.get(['sessionLog'])
  sessionLog.push({
    domain, duration, category,
    switches: nearbySwitches,
    spiral: spiralFlag,
    hour: new Date().getHours(),
    audio: isAudio,
    ts: Date.now(),
  })
  if (sessionLog.length > 500) sessionLog.shift()
  await chrome.storage.local.set({ sessionLog })

  if (sessionLog.length % REFIT_EVERY === 0) {
    runTrainingPipeline()   // fire-and-forget — don't block saveTimeSpent()
  }
}

async function saveTimeSpent(domain, timeInSeconds, weight = 1.0) {
  if (!domain) return
  const weighted = timeInSeconds * weight
  if (weighted < 0.5) return

  const data = await chrome.storage.local.get(['domainStats', 'customCategories', 'hourlyToday'])
  const stats       = data.domainStats      || {}
  const overrides   = data.customCategories || {}
  const hourlyToday = data.hourlyToday      || {}

  const existing = stats[domain]
  const { category, guessed, source } = (existing?.source === 'content' || existing?.source === 'model')
    ? { category: existing.category, guessed: existing.guessed, source: existing.source }
    : getCategory(domain, overrides)

  stats[domain] = {
    ...existing,
    time: (existing?.time || 0) + weighted,
    category, guessed, source,
    title: existing?.title || null,
  }

  const hour = new Date().getHours()
  if (!hourlyToday[hour]) hourlyToday[hour] = { productive: 0, neutral: 0, unproductive: 0 }
  hourlyToday[hour][category] = (hourlyToday[hour][category] || 0) + weighted

  // Push into rolling buffer first, so this session itself can count toward the spiral check
  recentActivity.push({ domain, category, time: weighted, timestamp: Date.now() })

  const nearbySwitches = sessionSwitchBuffer.filter(t => Date.now() - t < 2 * 60 * 1000).length
  const spiralCheck = detectSpiral()
  const spiralFlag = spiralCheck.spiral && spiralCheck.spiralDomains.includes(domain)
  const isAudio = weight !== 1.0   // true for the 0.3× audio-weighted calls — flag if you ever add a third weight

  await logSession(domain, weighted, category, nearbySwitches, spiralFlag, isAudio)
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
    // sessionSwitchBuffer is time-pruned anyway, but reset for cleanliness
    sessionSwitchBuffer = []

    // NOTE: sessionLog is intentionally NOT cleared here — it's the training
    // data for the behavioral classifier (Stage 2/3) and needs to accumulate
    // across days to reach 5+ sessions per domain.

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

  sessionSwitchBuffer.push(now)
  sessionSwitchBuffer = sessionSwitchBuffer.filter(t => now - t < 2 * 60 * 1000)

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
          category:  domainResult.source === 'default' ? result.category : existing.category,
          guessed:   domainResult.source === 'default' ? true : existing.guessed,
          source:    domainResult.source === 'default' ? 'content' : existing.source,
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