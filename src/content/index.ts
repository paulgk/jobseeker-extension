import type { ExtractJDMessage, ExtractionResponse } from '../shared/types'

const JD_SELECTORS = [
  'div.show-more-less-html__markup',       // confirmed working Oct 2025
  '.jobs-box__html-content',               // confirmed working 2024-2025
  '.jobs-description-content__text',
  '#job-details',
]

const TITLE_SELECTORS = [
  '.job-details-jobs-unified-top-card__job-title h1',
  'h1',                                    // generic fallback
]

const COMPANY_SELECTORS = [
  '.job-details-jobs-unified-top-card__company-name a',
  '.jobs-unified-top-card__company-name a',
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

async function waitForJDElement(timeoutMs = 5000): Promise<Element | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    for (const sel of JD_SELECTORS) {
      const el = document.querySelector(sel)
      if (el && (el as HTMLElement).innerText?.trim().length > 50) return el
    }
    await new Promise(r => setTimeout(r, 200))
  }
  return null
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
  if (!jdEl) return { error: 'timeout' }

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
