// ── Dhi content script ────────────────────────────────────────────────────────
// Runs on every page load. Reads visible text signals (title, meta description,
// first H1) and sends them to background.js for content-aware categorization.
// Never reads body text, form values, passwords, or private content.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  // Only run once per page load
  if (window.__dhiContentScriptRan) return
  window.__dhiContentScriptRan = true

  // Wait a moment for dynamic titles to settle (SPAs update title after load)
  setTimeout(() => {
    try {
      const title = document.title?.trim() || ''

      const metaDesc =
        document.querySelector('meta[name="description"]')?.content?.trim() ||
        document.querySelector('meta[property="og:description"]')?.content?.trim() ||
        ''

      const h1 = document.querySelector('h1')?.innerText?.trim()?.slice(0, 120) || ''

      const ogType =
        document.querySelector('meta[property="og:type"]')?.content?.trim() || ''

      // Combine signals into one string for keyword scoring
      const signals = [title, metaDesc.slice(0, 200), h1, ogType]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (!signals || signals.length < 5) return

      chrome.runtime.sendMessage({
        action: 'contentHint',
        url: window.location.href,
        signals,
        title,
      })
    } catch (e) {
      // Silently fail — content script should never break the page
    }
  }, 800)
})()