/**
 * EditorTestPage.tsx — Harnais de test minimal pour BlockEditor
 *
 * Rendu en isolation, sans Electron ni App2.
 * Playwright navigue vers /tests/fixtures/editor.html pour lancer ce harnais.
 *
 * Protocole de test :
 *   - window.__PW_MD__         : markdown initial injecté par addInitScript()
 *   - #pw-md-output            : <pre> caché contenant le markdown courant (lu par les tests)
 */

import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BlockEditor } from '../../src/parts/MarkdownEditor/BlockEditor'
import '../../src/index.css'

declare global {
  interface Window {
    __PW_MD__?: string
  }
}

export const DEFAULT_TEST_MD = [
  '# Titre de test',
  '',
  'Paragraphe un.',
  '',
  'Paragraphe deux.',
  '',
  'Paragraphe trois.',
  '',
].join('\n')

const INITIAL_MD = window.__PW_MD__ ?? DEFAULT_TEST_MD

function TestApp() {
  const [md, setMd] = useState(INITIAL_MD)

  return (
    <div style={{ padding: '40px', maxWidth: '860px', margin: '0 auto' }}>
      {/* Spy : markdown courant lisible par Playwright sans évaluer le DOM React */}
      <pre
        id="pw-md-output"
        data-testid="pw-md-output"
        style={{ display: 'none' }}
      >{md}</pre>

      <BlockEditor markdown={md} onChange={setMd} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<TestApp />)
