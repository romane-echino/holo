import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownRenderer } from '../../src/parts/MarkdownRenderer'
import '../../src/index.css'

declare global {
  interface Window {
    __PW_MD__?: string
  }
}

const DEFAULT_MD = [
  'Here is a simple footnote[^1].',
  '',
  '[^1]: My reference.',
].join('\n')

function TestApp() {
  const [markdown] = useState(window.__PW_MD__ ?? DEFAULT_MD)

  return (
    <div data-testid="markdown-renderer-fixture" style={{ padding: '40px', maxWidth: '860px', margin: '0 auto' }}>
      <MarkdownRenderer markdown={markdown} mode="view" />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<TestApp />)