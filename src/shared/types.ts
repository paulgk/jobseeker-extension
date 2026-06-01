// Message types for popup ↔ content script communication

export interface ExtractJDMessage {
  type: 'EXTRACT_JD'
}

export interface JDExtractionResult {
  jobTitle: string | null
  companyName: string | null
  jdText: string | null
  url: string
}

export interface ExtractionError {
  error: 'not-a-job-page' | 'not-found' | 'timeout' | 'extraction-failed'
}

export type ExtractionResponse = JDExtractionResult | ExtractionError
