export interface AnalysisResult {
  score: number        // 0–100 integer
  rationale: string    // one sentence, ≤25 words
  actionItems: string[] // exactly 3 strings, each ≤20 words
  keywordGaps: string[] // 3–10 short phrases
}

export async function analyseMatch(
  apiKey: string,
  resumeText: string,
  jdText: string,
): Promise<AnalysisResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: buildPrompt(resumeText, jdText) }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err?.error?.message ?? `API error ${response.status}`)
  }

  const data = await response.json() as { content: Array<{ text: string }> }
  const text: string = data.content[0].text
  return parseResult(text)
}

function buildPrompt(resumeText: string, jdText: string): string {
  return `Analyse this resume against this job description.

<resume>
${resumeText.slice(0, 3000)}
</resume>

<job_description>
${jdText.slice(0, 3000)}
</job_description>

Respond with ONLY a JSON object — no markdown fencing, no explanation:
{
  "score": <integer 0-100>,
  "rationale": "<one sentence ≤25 words explaining the score>",
  "actionItems": [
    "<sentence 1 — most impactful action ≤20 words>",
    "<sentence 2>",
    "<sentence 3>"
  ],
  "keywordGaps": ["<term1>", "<term2>", ...]
}

Scoring rubric: required skills 40%, experience level 25%, domain match 20%, education 15%.
keywordGaps: 3–10 key terms from the job description absent from the resume, ordered by importance.
actionItems: exactly 3, ordered by impact on match score, each a complete sentence.`
}

function parseResult(text: string): AnalysisResult {
  const cleaned = text.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(cleaned) as {
    score: unknown
    rationale?: string
    actionItems?: string[]
    keywordGaps?: string[]
  }
  if (typeof parsed.score !== 'number') throw new Error('Invalid response shape')
  return {
    score: Math.min(100, Math.max(0, Math.round(parsed.score))),
    rationale: parsed.rationale ?? '',
    actionItems: (parsed.actionItems ?? []).slice(0, 3),
    keywordGaps: (parsed.keywordGaps ?? []).slice(0, 8),
  }
}
