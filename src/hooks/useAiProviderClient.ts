import { useCallback } from 'react'

export type AiProvider = 'auto' | 'openai' | 'gemini'

type UseAiProviderClientParams = {
  aiProvider: AiProvider
  openaiApiKey: string
  geminiApiKey: string
  openaiPrompt: string
}

export function useAiProviderClient({
  aiProvider,
  openaiApiKey,
  geminiApiKey,
  openaiPrompt,
}: UseAiProviderClientParams) {
  const askOpenAI = useCallback(
    async (userMessage: string): Promise<string> => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiApiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: openaiPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 2048,
        }),
      })

      if (!response.ok) {
        throw new Error(`OpenAI ${response.status}`)
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
      return data.choices?.[0]?.message?.content ?? ''
    },
    [openaiApiKey, openaiPrompt],
  )

  const askGemini = useCallback(
    async (userMessage: string): Promise<string> => {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: openaiPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userMessage }],
            },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`Gemini ${response.status}`)
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>
          }
        }>
      }

      const firstCandidateParts = data.candidates?.[0]?.content?.parts ?? []
      return firstCandidateParts.map((part) => part.text ?? '').join('').trim()
    },
    [geminiApiKey, openaiPrompt],
  )

  const askAi = useCallback(
    async (userMessage: string): Promise<string> => {
      const hasOpenAi = openaiApiKey.trim().length > 0
      const hasGemini = geminiApiKey.trim().length > 0

      if (!hasOpenAi && !hasGemini) {
        throw new Error('NO_PROVIDER')
      }

      if (aiProvider === 'openai') {
        if (!hasOpenAi) {
          throw new Error('OPENAI_KEY_MISSING')
        }

        return askOpenAI(userMessage)
      }

      if (aiProvider === 'gemini') {
        if (!hasGemini) {
          throw new Error('GEMINI_KEY_MISSING')
        }

        return askGemini(userMessage)
      }

      if (hasGemini) {
        return askGemini(userMessage)
      }

      return askOpenAI(userMessage)
    },
    [aiProvider, askGemini, askOpenAI, geminiApiKey, openaiApiKey],
  )

  return { askAi }
}
