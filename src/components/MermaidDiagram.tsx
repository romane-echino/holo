import { AlertCircle } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import mermaid from 'mermaid'
import { cn } from '../utils/global'

export interface MermaidDiagramProps {
  code: string
  className?: string
}

let isMermaidInitialized = false

function ensureMermaidInitialized() {
  if (isMermaidInitialized) return

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    htmlLabels: false,
    themeVariables: {
      background: 'transparent',
      primaryColor: '#7b61ff22',
      primaryBorderColor: '#7b61ff',
      primaryTextColor: '#e7ecf5',
      secondaryColor: '#10b98122',
      secondaryBorderColor: '#10b981',
      tertiaryColor: '#38bdf822',
      tertiaryBorderColor: '#38bdf8',
      lineColor: '#9aa5bd',
      textColor: '#dbe4f0',
      mainBkg: '#111823',
      clusterBkg: '#0f172433',
      clusterBorder: '#64748b',
      edgeLabelBackground: '#0f1724',
      fontFamily: 'IBM Plex Sans, ui-sans-serif, system-ui, sans-serif',
      fontSize: '15px',
      radius: 14,
    },
    themeCSS: `
      .node rect,
      .cluster rect,
      .label-container {
        rx: 14px;
        ry: 14px;
      }

      .nodeLabel,
      .edgeLabel {
        line-height: 1.3;
      }
    `,
    flowchart: {
      curve: 'basis',
    },
  })

  isMermaidInitialized = true
}

export function MermaidDiagram({ code, className }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reactId = useId()
  const diagramId = useMemo(() => `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [reactId])

  useEffect(() => {
    let cancelled = false

    const renderDiagram = async () => {
      const source = code.trim()
      if (!source) {
        setSvg(null)
        setError(null)
        return
      }

      try {
        ensureMermaidInitialized()
        const { svg: renderedSvg } = await mermaid.render(diagramId, source)
        if (!cancelled) {
          setSvg(renderedSvg)
          setError(null)
        }
      } catch (renderError) {
        if (!cancelled) {
          setSvg(null)
          setError(renderError instanceof Error ? renderError.message : 'Erreur Mermaid')
        }
      }
    }

    void renderDiagram()
    return () => {
      cancelled = true
    }
  }, [code, diagramId])

  if (!code.trim()) {
    return (
      <div className={cn('flex min-h-[160px] items-center justify-center rounded-holo-xl border border-dashed border-holo-border-soft bg-black/10 text-sm italic text-holo-text-faint', className)}>
        Diagramme vide
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex min-h-[160px] items-center gap-3 rounded-holo-xl border border-rose-400/30 bg-rose-400/8 px-4 py-4 text-sm text-rose-100', className)}>
        <AlertCircle size={18} className="shrink-0 text-rose-300" />
        <div>
          <div className="font-medium">Erreur Mermaid</div>
          <div className="mt-1 text-xs text-rose-100/80">{error}</div>
        </div>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className={cn('flex min-h-[160px] items-center justify-center rounded-holo-xl border border-holo-border-soft bg-black/10 px-4 text-sm text-holo-text-faint', className)}>
        Rendu du diagramme…
      </div>
    )
  }

  return (
    <div
      className={cn('mermaid-diagram flex items-center justify-center holo-scrollbar overflow-x-auto rounded-holo-xl bg-[radial-gradient(circle_at_top,rgba(123,97,255,0.12),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full', className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}