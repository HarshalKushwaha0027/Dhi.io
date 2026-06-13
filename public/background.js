// ── State ────────────────────────────────────────────────────────────────────
let currentTabState = { tabId: null, url: null, startTime: null }
const audioTimers = {}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getDomain(url) {
  if (!url) return null
  try {
    const h = new URL(url).hostname
      .replace('www.', '')      // strip www.
      .replace('m.', '')        // strip mobile subdomain too
      .toLowerCase()
    if (!h || h === 'newtab' || h === 'extensions') return null
    return h
  } catch { return null }
}

function isIgnored(url) {
  if (!url) return true
  return url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')
}

async function saveTimeSpent(domain, timeInSeconds, weight = 1.0) {
  if (!domain) return
  const weighted = timeInSeconds * weight
  if (weighted < 0.5) return // ignore < 0.5s blips
  const data = await chrome.storage.local.get(['domainStats'])
  const stats = data.domainStats || {}
  stats[domain] = (stats[domain] || 0) + weighted
  await chrome.storage.local.set({ domainStats: stats })
  console.log(`💾 ${domain}: +${weighted.toFixed(1)}s (weight=${weight}) | total=${stats[domain].toFixed(1)}s`)
}

// ── Keep service worker alive ─────────────────────────────────────────────────
// Chrome kills the SW after ~30s — this alarm pings it every 25s to keep it awake
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 }) // every 25s
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('🔄 SW keepalive ping')
  }
})

// ── Tab switches (Active time) ────────────────────────────────────────────────
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const now = Date.now()

  // Save time for previous tab
  if (currentTabState.tabId !== null && currentTabState.startTime !== null) {
    const timeSpent = (now - currentTabState.startTime) / 1000
    const domain = getDomain(currentTabState.url)
    if (domain) await saveTimeSpent(domain, timeSpent, 1.0)
  }

  // Start tracking new tab
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId)
    currentTabState = { tabId: activeInfo.tabId, url: tab.url, startTime: now }
    console.log(`👀 Now watching: ${getDomain(tab.url) || 'ignored page'}`)
  } catch (e) {
    console.error('Tab fetch error:', e)
    currentTabState = { tabId: null, url: null, startTime: null }
  }
})

// Update URL when page navigates inside same tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Track URL changes in the active tab
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

  // Audio tracking (passive - 0.3x weight)
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
          sendResponse({ stats: data.domainStats || {} })
        })
      })
    } else {
      chrome.storage.local.get(['domainStats'], (data) => {
        sendResponse({ stats: data.domainStats || {} })
      })
    }
    return true
  }
})