import { useEffect, useState } from 'react'
import { getSettings, saveSettings } from '../shared/storage'

export default function App() {
  const [resumeText, setResumeText] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSettings().then(({ resumeText: r = '', apiKey: k = '' }) => {
      setResumeText(r)
      setApiKey(k)
    })
  }, [])

  async function handleSave() {
    setError('')
    if (!resumeText.trim()) {
      setError('Resume text cannot be empty.')
      return
    }
    if (!apiKey.trim()) {
      setError('API key cannot be empty.')
      return
    }
    try {
      await saveSettings({ resumeText, apiKey })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Save failed. Please try again.')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold text-gray-900">JobSeeker Settings</h1>

      <p className="mt-2 text-sm text-gray-500">
        Your resume and API key are stored locally in your browser only. They are never sent to any
        server except Anthropic's API directly from your browser when you trigger an analysis.
      </p>

      <div className="mt-8 space-y-6">

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Resume text
          </label>
          <textarea
            value={resumeText}
            onChange={e => setResumeText(e.target.value)}
            rows={12}
            placeholder="Paste your resume text here..."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Anthropic API key
          </label>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Your key is stored locally. It is only sent to api.anthropic.com.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Save
          </button>
          {saved && (
            <span className="text-sm text-green-600">Saved</span>
          )}
        </div>

      </div>
    </div>
  )
}
