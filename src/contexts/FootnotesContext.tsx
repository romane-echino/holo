/**
 * FootnotesContext — Gestion des contenus de notes de bas de page
 *
 * Les footnotes sont 100% inline (comme des liens).
 * Leur contenu est stocké dans un Map<id, contenu>.
 */

import React, { createContext, useContext, useState, useCallback } from 'react'

interface FootnotesContextType {
  footnotes: Map<string, string>
  setFootnote: (id: string, content: string) => void
  removeFootnote: (id: string) => void
  getFootnote: (id: string) => string | undefined
  initFootnotes: (map: Map<string, string>) => void
}

const FootnotesContext = createContext<FootnotesContextType | undefined>(undefined)

export function FootnotesProvider({ children }: { children: React.ReactNode }) {
  const [footnotes, setFootnotesMap] = useState<Map<string, string>>(new Map())

  const setFootnote = useCallback((id: string, content: string) => {
    setFootnotesMap((prev) => new Map(prev).set(id, content))
  }, [])

  const removeFootnote = useCallback((id: string) => {
    setFootnotesMap((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const getFootnote = useCallback((id: string) => {
    return footnotes.get(id)
  }, [footnotes])

  const initFootnotes = useCallback((map: Map<string, string>) => {
    setFootnotesMap(new Map(map))
  }, [])

  return (
    <FootnotesContext.Provider value={{ footnotes, setFootnote, removeFootnote, getFootnote, initFootnotes }}>
      {children}
    </FootnotesContext.Provider>
  )
}

export function useFootnotes() {
  const context = useContext(FootnotesContext)
  if (!context) {
    throw new Error('useFootnotes must be used within FootnotesProvider')
  }
  return context
}
