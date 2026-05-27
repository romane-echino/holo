/**
 * CodeBlock.tsx — Bloc de code (fenced code block)
 *
 * Rendu en lecture seule avec style monospace et lang badge.
 * Cliquer permet de copier le code dans le presse-papiers.
 */

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '../../../utils/global'
import type { CodeNode } from '../lib/types'

interface CodeBlockProps {
  node: CodeNode
}

export function CodeBlock({ node }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(node.value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="group relative my-4 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-glass/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-holo-border-soft/60 px-4 py-2">
        <span className="font-mono text-[11px] text-holo-text-faint">
          {node.lang || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 rounded-holo-sm px-2 py-1 text-[11px] transition',
            copied
              ? 'text-holo-success'
              : 'text-holo-text-faint opacity-0 group-hover:opacity-100 hover:text-holo-text',
          )}
          title="Copier le code"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>

      {/* Code */}
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-holo-text-muted holo-scrollbar">
        <code>{node.value}</code>
      </pre>
    </div>
  )
}
