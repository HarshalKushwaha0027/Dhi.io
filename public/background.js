// ── State ────────────────────────────────────────────────────────────────────
let currentTabState = { tabId: null, url: null, startTime: null }
const audioTimers = {}
let switchLog = []

// ── Default category map (overridable per-domain via customCategories) ───────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDomain(url) {
  if (!url) return null
  try {
    const h = new URL(url).hostname
      .replace('www.', '')
      .replace('m.', '')
      .toLowerCase()
    if (!h || h === 'newtab' || h === 'extensions') return null
    const parts = h.split('.')
    return parts.length > 2 ? parts.slice(-2).join('.') : h
  } catch { return null }
}

function isIgnored(url) {
  if (!url) return true
  return url.startsWith('chrome://') ||
         url.startsWith('chrome-extension://') ||
         url.startsWith('about:')
}

// getCategory now checks user overrides FIRST, then falls back to defaults
function getCategory(domain, overrides = {}) {
  if (!domain) return 'neutral'
  if (overrides[domain]) return overrides[domain]
  for (const [cat, list] of Object.entries(CATEGORIES)) {
    if (list.some(d => domain.includes(d))) return cat
  }
  return 'neutral'
}

// ── Save time — stores { time, category } per domain ─────────────────────────
async function saveTimeSpent(domain, timeInSeconds, weight = 1.0) {
  if (!domain) return
  const weighted = timeInSeconds * weight
  if (weighted < 0.5) return

  const data = await chrome.storage.local.get(['domainStats', 'customCategories'])
  const stats     = data.domainStats || {}
  const overrides = data.customCategories || {}

  const existing = stats[domain] || { time: 0, category: getCategory(domain, overrides) }
  stats[domain] = {
    time: existing.time + weighted,
    category: getCategory(domain, overrides)
  }

  await chrome.storage.local.set({ domainStats: stats })
  console.log(`💾 ${domain} [${stats[domain].category}]: +${weighted.toFixed(1)}s | total=${stats[domain].time.toFixed(1)}s`)
}

// ── Keep service worker alive ─────────────────────────────────────────────────
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 })

// ── Daily reset at midnight — saves today into history first ─────────────────
chrome.alarms.create('dailyReset', { when: nextMidnight(), periodInMinutes: 1440 })

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('🔄 SW keepalive ping')
    return
  }

  if (alarm.name === 'dailyReset') {
    const data = await chrome.storage.local.get(['domainStats', 'history'])
    const todayStats = data.domainStats || {}
    const history     = data.history || {}

    const todayKey  = new Date().toISOString().split('T')[0]
    const entries   = Object.values(todayStats)
    const totalTime = entries.reduce((s, x) => s + (x?.time || 0), 0)

    if (totalTime > 0) {
      history[todayKey] = { domainStats: todayStats, totalTime, savedAt: Date.now() }
      const keys = Object.keys(history).sort()
      while (keys.length > 7) delete history[keys.shift()]
    }

    await chrome.storage.local.set({ domainStats: {}, history })
    console.log(`🌅 Daily reset — saved ${todayKey} to history, stats cleared`)
  }
})

function nextMidnight() {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime()
}

// ── Tab switches (Active time) ────────────────────────────────────────────────
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const now = Date.now()

  switchLog.push(now)
  switchLog = switchLog.filter(t => now - t < 3 * 60 * 1000)
  if (switchLog.length > 10) {
    chrome.notifications.create('switchAlert', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon16.png'),
      title: 'Dhi — focus check',
      message: 'You switched tabs 10+ times in 3 minutes. Take a breath. 🧘'
    })
    switchLog = []
  }

  if (currentTabState.tabId !== null && currentTabState.startTime !== null) {
    const timeSpent = (now - currentTabState.startTime) / 1000
    const domain = getDomain(currentTabState.url)
    if (domain && !isIgnored(currentTabState.url)) {
      await saveTimeSpent(domain, timeSpent, 1.0)
    }
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
      const timeSpent = (now - currentTabState.startTime) / 1000
      saveTimeSpent(oldDomain, timeSpent, 1.0)
    }

    currentTabState.url = changeInfo.url
    currentTabState.startTime = now
    console.log(`🔀 URL changed → ${newDomain || 'ignored'}`)
  }

  if (changeInfo.audible === true) {
    const domain = getDomain(tab.url)
    if (domain) {
      audioTimers[tabId] = { domain, startTime: Date.now() }
      console.log(`[Audio] ▶ Started: ${domain}`)
    }
  } else if (changeInfo.audible === false && audioTimers[tabId]) {
    const { domain, startTime } = audioTimers[tabId]
    const secs = (Date.now() - startTime) / 1000
    saveTimeSpent(domain, secs, 0.3)
    console.log(`[Audio] ⏹ Stopped: ${domain} — ${secs.toFixed(1)}s mild`)
    delete audioTimers[tabId]
  }
})

// ── Idle detection ────────────────────────────────────────────────────────────
chrome.idle.setDetectionInterval(60)
chrome.idle.onStateChanged.addListener(async (newState) => {
  console.log(`[Idle] → ${newState}`)
  if (newState === 'idle' || newState === 'locked') {
    if (currentTabState.tabId !== null && currentTabState.startTime !== null) {
      const secs = (Date.now() - currentTabState.startTime) / 1000
      const domain = getDomain(currentTabState.url)
      if (domain) await saveTimeSpent(domain, secs, 1.0)
      currentTabState.startTime = null
      console.log(`⏸ Paused: ${domain}`)
    }
  } else if (newState === 'active') {
    currentTabState.startTime = Date.now()
    console.log(`▶ Resumed: ${getDomain(currentTabState.url)}`)
  }
})

// ── Message bridge ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getLatestStats') {
    const now = Date.now()
    if (currentTabState.tabId !== null && currentTabState.startTime !== null) {
      const secs = (now - currentTabState.startTime) / 1000
      const domain = getDomain(currentTabState.url)
      saveTimeSpent(domain, secs, 1.0).then(() => {
        currentTabState.startTime = Date.now()
        chrome.storage.local.get(['domainStats'], (data) => {
          sendResponse({ stats: data.domainStats || {}, switchCount: switchLog.length })
        })
      })
    } else {
      chrome.storage.local.get(['domainStats'], (data) => {
        sendResponse({ stats: data.domainStats || {}, switchCount: switchLog.length })
      })
    }
    return true
  }
})