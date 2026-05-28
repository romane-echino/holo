/**
 * AIPanel.tsx — Panneau assistant IA style GitHub Copilot Chat
 *
 * Interface de chat avec historique de conversation, rendu markdown des réponses,
 * et intégration avec le provider IA configuré (OpenAI / Gemini).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Send, Trash2, AlertCircle, Settings, StopCircle } from 'lucide-react'
import { cn } from '../utils/global'
import { useAiProviderClient } from '../hooks/useAiProviderClient'
import { useConfig } from '../contexts/ConfigContext'
import { useEditor } from '../contexts/EditorContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
}

// ─── Rendu markdown simplifié ─────────────────────────────────────────────────

function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11px] text-holo-primary-soft">{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-holo-text">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i} className="italic">{part.slice(1, -1)}</em>
    return part
  })
}

function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      elements.push(
        <pre key={i} className="my-2 overflow-x-auto rounded-holo-lg bg-black/40 px-3 py-2.5 font-mono text-[11.5px] text-holo-text/90">
          {lang && <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-holo-text-faint">{lang}</span>}
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      i++; continue
    }
    if (line.startsWith('### ')) elements.push(<h3 key={i} className="mt-3 mb-1 text-sm font-semibold text-holo-text">{inlineMarkdown(line.slice(4))}</h3>)
    else if (line.startsWith('## ')) elements.push(<h2 key={i} className="mt-4 mb-1 text-sm font-bold text-holo-text">{inlineMarkdown(line.slice(3))}</h2>)
    else if (line.startsWith('# ')) elements.push(<h1 key={i} className="mt-4 mb-1 text-base font-bold text-holo-text">{inlineMarkdown(line.slice(2))}</h1>)
    else if (line.match(/^[-*] /)) elements.push(<li key={i} className="ml-3 list-disc text-sm leading-relaxed text-holo-text/90">{inlineMarkdown(line.slice(2))}</li>)
    else if (line.match(/^\d+\. /)) elements.push(<li key={i} className="ml-3 list-decimal text-sm leading-relaxed text-holo-text/90">{inlineMarkdown(line.replace(/^\d+\. /, ''))}</li>)
    else if (line.trim() === '') elements.push(<div key={i} className="h-1.5" />)
    else elements.push(<p key={i} className="text-sm leading-relaxed text-holo-text/90">{inlineMarkdown(line)}</p>)
    i++
  }
  return <div className="space-y-0.5">{elements}</div>
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end px-4">
        <div className="max-w-[88%] rounded-[1rem] rounded-tr-sm border border-holo-primary/20 bg-holo-primary/20 px-4 py-2.5">
          <p className="text-sm leading-relaxed text-holo-text">{msg.content}</p>
        </div>
      </div>
    )
  }
  if (msg.role === 'error') {
    return (
      <div className="flex items-start gap-2.5 px-4">
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
          <AlertCircle size={13} />
        </div>
        <div className="flex-1 rounded-[1rem] rounded-tl-sm border border-red-500/20 bg-red-500/10 px-4 py-2.5">
          <p className="text-sm leading-relaxed text-red-300">{msg.content}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2.5 px-4">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-holo-primary-surface text-holo-primary-soft">
        <Bot size={13} />
      </div>
      <div className="flex-1 rounded-[1rem] rounded-tl-sm border border-holo-border-soft bg-white/[0.025] px-4 py-2.5">
        {renderMarkdown(msg.content)}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5 px-4">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-holo-primary-surface text-holo-primary-soft">
        <Bot size={13} />
      </div>
      <div className="flex items-center gap-1.5 rounded-[1rem] rounded-tl-sm border border-holo-border-soft bg-white/[0.025] px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 rounded-full bg-holo-text-faint animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
        ))}
      </div>
    </div>
  )
}

const SUGGESTIONS = ['Explique ce document', 'Résume en 3 points clés', 'Améliore la structure', 'Propose un plan détaillé', 'Trouve des incohérences']

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-5 px-5 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-holo-primary-surface text-holo-primary-soft shadow-[0_0_20px_rgba(123,97,255,.2)]">
        <Bot size={22} />
      </div>
      <div>
        <p className="text-sm font-medium text-holo-text">Comment puis-je vous aider ?</p>
        <p className="mt-1 text-xs text-holo-text-faint">Posez une question sur votre contenu</p>
      </div>
      <div className="flex w-full flex-col gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onSuggestion(s)} className="w-full rounded-holo-lg border border-holo-border-soft bg-holo-glass/30 px-3 py-2 text-left text-xs text-holo-text-muted transition hover:bg-holo-glass hover:text-holo-text">
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function NoProviderState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-5 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
        <AlertCircle size={22} />
      </div>
      <div>
        <p className="text-sm font-medium text-holo-text">Assistant IA non configuré</p>
        <p className="mt-1 text-xs text-holo-text-faint">Configurez une clé API OpenAI ou Gemini dans les paramètres pour utiliser l'assistant.</p>
      </div>
      <button onClick={onOpenSettings} className="flex items-center gap-2 rounded-holo-lg border border-holo-border-soft bg-holo-glass px-4 py-2 text-xs text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text">
        <Settings size={13} /> Ouvrir les paramètres
      </button>
    </div>
  )
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export function AIPanel() {
  const navigate = useNavigate()
  const { openaiApiKey, geminiApiKey } = useConfig()
  const { askAi } = useAiProviderClient()
  const { activeTabPath } = useEditor()

  const hasProvider = openaiApiKey.trim().length > 0 || geminiApiKey.trim().length > 0
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
  }, [input])

  const contextFile = activeTabPath ? activeTabPath.replace(/\\/g, '/').split('/').at(-1) : null

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: trimmed }])
    setInput('')
    setLoading(true)
    const fullPrompt = contextFile ? `[Fichier actif : ${contextFile}]\n\n${trimmed}` : trimmed
    try {
      const response = await askAi(fullPrompt)
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: response }])
    } catch (err) {
      const msg = err instanceof Error ? (err.message === 'NO_PROVIDER' ? 'Aucun fournisseur IA configuré.' : err.message) : 'Erreur inconnue'
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'error', content: msg }])
    } finally {
      setLoading(false)
    }
  }, [loading, askAi, contextFile])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header mobile */}
      <div className="flex shrink-0 items-center gap-2 border-b border-holo-border-soft px-3 py-2 lg:hidden">
        <button onClick={() => navigate('/')} className="flex size-8 shrink-0 items-center justify-center rounded-holo-md text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text">
          <ArrowLeft size={16} />
        </button>
        <span className="flex-1 truncate text-sm font-medium">Assistant IA</span>
      </div>

      {/* Header desktop */}
      <div className="hidden shrink-0 items-center justify-between px-4 pb-3 pt-4 lg:flex">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Assistant IA</h2>
          {hasProvider && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">Actif</span>}
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} className="flex items-center gap-1 rounded-holo-md px-2 py-1 text-[11px] text-holo-text-faint transition hover:bg-holo-glass hover:text-holo-text">
            <Trash2 size={12} /> Effacer
          </button>
        )}
      </div>

      {/* Context chip */}
      {contextFile && (
        <div className="shrink-0 px-4 pb-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-holo-border-soft bg-holo-glass px-2.5 py-1 text-[10px] text-holo-text-faint">
            <span className="text-holo-primary-soft/70">@</span>
            <span className="max-w-[200px] truncate">{contextFile}</span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-2 holo-scrollbar">
        {!hasProvider ? (
          <NoProviderState onOpenSettings={() => {}} />
        ) : messages.length === 0 ? (
          <EmptyState onSuggestion={(s) => void sendMessage(s)} />
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
        {loading && <TypingIndicator />}
      </div>

      {/* Input */}
      {hasProvider && (
        <div className="shrink-0 border-t border-holo-border-soft p-3">
          <div className={cn('flex items-end gap-2 rounded-[1.1rem] border border-holo-border-soft bg-holo-glass/40 px-3 py-2 transition focus-within:border-holo-primary/30 focus-within:bg-white/[0.03]')}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input) } }}
              placeholder="Demandez quelque chose… (Entrée pour envoyer)"
              rows={1}
              disabled={loading}
              className="flex-1 resize-none bg-transparent text-sm text-holo-text placeholder:text-holo-text-faint focus:outline-none disabled:opacity-50"
              style={{ maxHeight: '160px' }}
            />
            <button
              onClick={() => void sendMessage(input)}
              disabled={loading || !input.trim()}
              className={cn('mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-holo-lg transition', input.trim() && !loading ? 'bg-holo-primary text-white hover:bg-holo-primary/90' : 'text-holo-text-faint opacity-40')}
            >
              {loading ? <StopCircle size={14} /> : <Send size={14} />}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-holo-text-faint">Shift+Entrée pour nouvelle ligne</p>
        </div>
      )}
    </div>
  )
}
