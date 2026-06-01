export interface ExtensionSettings {
  resumeText: string
  apiKey: string
}

export async function getSettings(): Promise<Partial<ExtensionSettings>> {
  return chrome.storage.local.get(['resumeText', 'apiKey']) as Promise<Partial<ExtensionSettings>>
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  return chrome.storage.local.set(settings)
}
