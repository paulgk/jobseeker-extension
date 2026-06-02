import type { ExtractJDMessage, ExtractionResponse } from '../shared/types'

const JD_SELECTORS = [
  // Specific known selectors (may break as LinkedIn updates)
  'div.show-more-less-html__markup',
  '.jobs-box__html-content',
  '.jobs-description-content__text',
  '#job-details',
  '.jobs-description',
  // Broader attribute-based selectors
  '[class*="show-more-less-html"]',
  '[class*="jobs-description"]',
  '[class*="job-description"]',
  '[class*="description__text"]',
]

const TITLE_SELECTORS = [
  '.job-details-jobs-unified-top-card__job-title h1',
  '[class*="job-title"] h1',
  '[class*="top-card"] h1',
  'h1',
]

const COMPANY_SELECTORS = [
  '.job-details-jobs-unified-top-card__company-name a',
  '.jobs-unified-top-card__company-name a',
  '[class*="company-name"] a',
  '[class*="company-name"]',
]

function stripHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.innerText.trim()
}

function firstMatchText(selectors: string[], minLength = 10): string | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    const text = (el as HTMLElement | null)?.innerText?.trim()
    if (text && text.length >= minLength) return text
  }
  return null
}

function clickShowMore(): void {
  // Click any "Show more" / "See more" button that expands the job description
  const candidates = document.querySelectorAll('button, [role="button"]')
  for (const el of candidates) {
    const text = (el as HTMLElement).innerText?.trim().toLowerCase()
    if (text === 'show more' || text === 'see more' || text === 'expand') {
      ;(el as HTMLElement).click()
      return
    }
  }
}

async function waitForJDElement(timeoutMs = 5000): Promise<Element | null> {
  // Try clicking "Show more" immediately to expand collapsed descriptions
  clickShowMore()

  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    for (const sel of JD_SELECTORS) {
      const el = document.querySelector(sel)
      if (el && (el as HTMLElement).innerText?.trim().length > 50) return el
    }
    // Re-attempt Show more click after initial DOM settle
    if (Date.now() - start > 1000 && Date.now() - start < 1200) clickShowMore()
    await new Promise(r => setTimeout(r, 200))
  }
  // Last resort: find the largest text-bearing div on the page
  return largestTextDiv()
}

function largestTextDiv(): Element | null {
  let best: Element | null = null
  let bestLen = 200 // minimum threshold
  document.querySelectorAll('div, article, section').forEach(el => {
    // Skip nav, header, footer, sidebar-like containers
    const cls = el.className?.toString().toLowerCase() ?? ''
    if (cls.includes('nav') || cls.includes('header') || cls.includes('sidebar') ||
        cls.includes('footer') || cls.includes('feed') || cls.includes('search')) return
    // Only consider leaf-ish elements (not huge wrappers with many children)
    if (el.children.length > 20) return
    const text = (el as HTMLElement).innerText?.trim() ?? ''
    if (text.length > bestLen) {
      bestLen = text.length
      best = el
    }
  })
  return best
}

function extractFromJsonLd(): Partial<{ jobTitle: string; companyName: string; jdText: string }> {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? '')
      if (data['@type'] === 'JobPosting') {
        return {
          jobTitle: data.title ?? undefined,
          companyName: data.hiringOrganization?.name ?? undefined,
          jdText: data.description ? stripHtml(data.description) : undefined,
        }
      }
    } catch { /* malformed JSON — try next */ }
  }
  return {}
}

async function performExtraction(): Promise<ExtractionResponse> {
  // Handle both numeric (/jobs/view/12345) and slug (/jobs/view/job-title-12345) URL formats
  const isJobView = /\/jobs\/view\/[^\s?]+/.test(window.location.pathname)
  const isJobSearch = window.location.search.includes('currentJobId=')
  if (!isJobView && !isJobSearch) {
    return { error: 'not-a-job-page' }
  }

  const ldResult = extractFromJsonLd()

  if (ldResult.jobTitle && ldResult.companyName && ldResult.jdText) {
    return {
      jobTitle: ldResult.jobTitle,
      companyName: ldResult.companyName,
      jdText: ldResult.jdText.slice(0, 4000),
      url: window.location.href,
    }
  }

  const jdEl = await waitForJDElement()
  if (!jdEl) return { error: 'timeout-no-fallback' }

  const jdText = (jdEl as HTMLElement).innerText.trim()
  if (jdText.length < 100) return { error: 'not-found' }

  return {
    jobTitle: ldResult.jobTitle ?? firstMatchText(TITLE_SELECTORS),
    companyName: ldResult.companyName ?? firstMatchText(COMPANY_SELECTORS),
    jdText: jdText.slice(0, 4000),
    url: window.location.href,
  }
}

// CRITICAL: listener must be synchronous and return true to keep channel open for async sendResponse
chrome.runtime.onMessage.addListener(
  (message: ExtractJDMessage, _sender: chrome.runtime.MessageSender, sendResponse: (r: ExtractionResponse) => void) => {
    if (message.type !== 'EXTRACT_JD') return false

    performExtraction()
      .then(sendResponse)
      .catch(() => sendResponse({ error: 'extraction-failed' }))

    return true  // Keep message channel open for async response
  }
)
