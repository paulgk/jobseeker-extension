import { useState, useEffect } from 'react'
import { getSettings } from '../shared/storage'
import { analyseMatch } from '../shared/anthropic'
import type { AnalysisResult } from '../shared/anthropic'
import type { ExtractionResponse, JDExtractionResult } from '../shared/types'

type Status = 'idle' | 'not-configured' | 'wrong-page' | 'ready' | 'loading' | 'result' | 'error'
type ErrorType = 'extraction' | 'api' | null

function scoreColor(score: number): string {
  if (score >= 75) return 'text-green-600'
  if (score >= 50) return 'text-amber-500'
  return 'text-red-500'
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [jd, setJd] = useState<JDExtractionResult | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [errorType, setErrorType] = useState<ErrorType>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [resumeText, setResumeText] = useState<string>('')
  const [apiKey, setApiKey] = useState<string>('')

  async function initPopup() {
    const { resumeText: r = '', apiKey: k = '' } = await getSettings()
    if (!r || !k) {
      setStatus('not-configured')
      return
    }
    setResumeText(r)
    setApiKey(k)

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      setStatus('wrong-page')
      return
    }
    const isJobPage = tab.url?.includes('/jobs/view/') || tab.url?.includes('currentJobId=')
    if (!isJobPage) {
      setStatus('wrong-page')
      return
    }

    try {
      const extraction = await chrome.tabs.sendMessage<{ type: 'EXTRACT_JD' }, ExtractionResponse>(
        tab.id,
        { type: 'EXTRACT_JD' },
      )
      if ('error' in extraction) {
        setErrorType('extraction')
        setErrorMsg(extraction.error)
        setStatus('error')
        return
      }
      setJd(extraction)
      setStatus('ready')
    } catch {
      setErrorType('extraction')
      setErrorMsg('sendMessage-failed')
      setStatus('error')
    }
  }

  async function handleAnalyse() {
    if (!jd?.jdText) return
    setStatus('loading')
    try {
      const res = await analyseMatch(apiKey, resumeText, jd.jdText)
      setResult(res)
      setStatus('result')
    } catch (e) {
      setErrorType('api')
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error')
      setStatus('error')
    }
  }

  function handleRetry() {
    if (errorType === 'extraction') {
      setStatus('idle')
      setJd(null)
      setResult(null)
      setErrorType(null)
      initPopup()
    } else if (errorType === 'api' && jd) {
      handleAnalyse()
    }
  }

  useEffect(() => {
    initPopup()
  }, [])

  const jobContextBlock = (
    <div className="bg-gray-50 rounded p-3 mt-3">
      <p className="text-sm font-semibold text-gray-900 truncate">{jd?.jobTitle ?? 'Untitled position'}</p>
      <p className="text-xs text-gray-500 mt-0.5">{jd?.companyName ?? 'Unknown company'}</p>
    </div>
  )

  return (
    <div className="w-[400px] font-sans bg-white">
      {/* Header — shared across all states */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-base font-semibold text-gray-900">JobSeeker</span>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="text-xs text-blue-600 hover:underline cursor-pointer"
        >
          Settings
        </button>
      </div>
      <div className="border-b border-gray-100" />

      <div className="p-4">
        {status === 'idle' && null}

        {status === 'not-configured' && (
          <div>
            <p className="text-sm font-semibold text-gray-700 text-center mt-3">Setup required</p>
            <p className="text-sm text-gray-500 text-center mt-1">Add your resume and API key to get started.</p>
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded mt-4 w-full cursor-pointer"
            >
              Open Settings
            </button>
          </div>
        )}

        {status === 'wrong-page' && (
          <div>
            <p className="text-sm font-semibold text-gray-700 text-center mt-3">Open a LinkedIn job posting</p>
            <p className="text-sm text-gray-500 text-center mt-1">Navigate to a specific job listing on LinkedIn to analyse your match.</p>
          </div>
        )}

        {status === 'ready' && (
          <div>
            {jobContextBlock}
            <button
              onClick={handleAnalyse}
              className="bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded mt-4 w-full cursor-pointer"
            >
              Analyse Match
            </button>
          </div>
        )}

        {status === 'loading' && (
          <div>
            {jobContextBlock}
            <div className="mt-6">
              <svg
                className="animate-spin h-5 w-5 text-blue-600 mx-auto"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-gray-500 text-center mt-2">Analysing match...</p>
            </div>
          </div>
        )}

        {status === 'result' && result !== null && (
          <div>
            {jobContextBlock}

            <div className="text-center mt-4">
              <p className={`text-5xl font-semibold ${scoreColor(result.score)}`}>{result.score}%</p>
              <p className="text-xs text-gray-600 mt-1">{result.rationale}</p>
            </div>

            {result.summary && (
              <div className="bg-gray-50 rounded p-3 mt-4">
                <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>
              </div>
            )}

            <div className="border-t border-gray-100 mt-4" />

            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Top actions</p>
              <div className="mt-2 space-y-2">
                {result.actionItems.map((item, i) => (
                  <div key={i} className="text-sm text-gray-800 leading-snug">
                    <span className="text-xs font-semibold text-blue-600 mr-2">{i + 1}.</span>{item}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 mt-4" />

            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Missing keywords</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {result.keywordGaps.slice(0, 8).map((kw, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-1">{kw}</span>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStatus('ready')}
              className="text-xs text-blue-600 hover:underline mt-4 text-right block w-full cursor-pointer"
            >
              Analyse again
            </button>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div className="bg-red-50 border border-red-200 rounded p-3 mt-3">
              {errorType === 'extraction' && (
                <>
                  <p className="text-sm font-semibold text-red-700">Could not read this job posting</p>
                  <p className="text-sm text-red-600 mt-0.5">LinkedIn may have updated their page. Try refreshing the tab, then open the popup again.</p>
                </>
              )}
              {errorType === 'api' && (
                <>
                  <p className="text-sm font-semibold text-red-700">Analysis failed</p>
                  <p className="text-sm text-red-600 mt-0.5">
                    {errorMsg.includes('401') || errorMsg.toLowerCase().includes('key')
                      ? 'Your API key was rejected. Check your key in Settings and try again.'
                      : 'The Anthropic API call failed. Check your connection and try again.'}
                  </p>
                </>
              )}
            </div>
            <button
              onClick={handleRetry}
              className="bg-white text-gray-700 border border-gray-300 text-sm font-medium px-4 py-2 rounded hover:bg-gray-50 mt-4 w-full cursor-pointer"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
