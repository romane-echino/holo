/**
 * WhatsNew.tsx — « Quoi de neuf » après une mise à jour
 *
 * Au démarrage, la version de Holo est comparée à la dernière vue sur ce
 * poste. Après une mise à jour, les nouveautés des versions installées depuis
 * s'affichent une fois. À la première installation, rien ne s'affiche.
 */
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { AbstractPopup } from './AbstractPopup'
import { CHANGELOG_ENTRIES } from '../constants/changelog'
import { entriesSince } from '../lib/whatsNew'
import type { ChangelogEntry } from '../types/shared'

const LAST_SEEN_KEY = 'last-seen-version'

export function WhatsNew() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [currentVersion, setCurrentVersion] = useState('')

  useEffect(() => {
    const holo = window.holo
    if (!holo?.getAppVersion || !holo.getHoloConfigValue) return
    let cancelled = false
    void (async () => {
      const current = (await holo.getAppVersion().catch(() => '')).replace(/^v/i, '')
      if (!current || cancelled) return
      const lastSeen = await holo.getHoloConfigValue(LAST_SEEN_KEY).catch(() => null)
      if (cancelled) return
      const news = entriesSince(CHANGELOG_ENTRIES, typeof lastSeen === 'string' ? lastSeen : null, current)
      setCurrentVersion(current)
      if (news.length > 0) setEntries(news)
      // Première installation, ou rien de nouveau : la version est notée tout de suite.
      else if (lastSeen !== current) await holo.setHoloConfigValue(LAST_SEEN_KEY, current).catch(() => {})
    })()
    return () => { cancelled = true }
  }, [])

  const close = () => {
    setEntries([])
    void window.holo?.setHoloConfigValue(LAST_SEEN_KEY, currentVersion).catch(() => {})
  }

  return (
    <AbstractPopup
      open={entries.length > 0}
      title={`Nouveautés de Holo ${currentVersion}`}
      description={entries.length > 1 ? `Depuis votre dernière version : ${entries.length} mises à jour.` : undefined}
      onClose={close}
      size="md"
      footer={(
        <div className="flex justify-end">
          <button
            type="button"
            onClick={close}
            className="rounded-holo-lg bg-holo-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-holo-primary/90"
          >
            C'est noté
          </button>
        </div>
      )}
    >
      <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1" data-testid="whats-new">
        {entries.map((entry) => (
          <section key={entry.version}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-holo-text">
              <Sparkles size={14} className="text-holo-primary-soft" />
              Version {entry.version}
              <span className="text-xs font-normal text-holo-text-faint">{entry.releasedAt}</span>
            </h3>
            <ul className="space-y-1.5 pl-1">
              {entry.items.map((item, index) => (
                <li key={index} className="flex gap-2 text-sm leading-6 text-holo-text-muted">
                  <span className="mt-0.5 shrink-0 text-holo-primary-soft">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AbstractPopup>
  )
}
