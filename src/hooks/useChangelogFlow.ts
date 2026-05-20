import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeVersionLabel } from '../lib/appUtils'
import { CHANGELOG_ENTRIES } from '../constants/changelog'
import { useUI } from '../contexts/UIContext'

export function useChangelogFlow({
  appVersion,
  getHoloApi,
}: {
  appVersion: string
  getHoloApi: () => Window['holo'] | null
}) {
  const { globalConfigReady, seenChangelogVersion, setSeenChangelogVersion } = useUI()
  const [showChangelogModal, setShowChangelogModal] = useState(false)
  const [selectedChangelogVersion, setSelectedChangelogVersion] = useState<string | null>(null)

  const selectedChangelogEntry = useMemo(
    () => CHANGELOG_ENTRIES.find((entry) => entry.version === selectedChangelogVersion) ?? null,
    [selectedChangelogVersion],
  )

  const currentVersionChangelog = useMemo(
    () => CHANGELOG_ENTRIES.find((entry) => entry.version === appVersion) ?? null,
    [appVersion],
  )

  const openChangelog = useCallback((version: string) => {
    setSelectedChangelogVersion(version)
    setShowChangelogModal(true)
  }, [])

  const closeChangelog = useCallback(() => {
    setShowChangelogModal(false)
  }, [])

  const markCurrentVersionChangelogAsSeen = useCallback(() => {
    const normalized = normalizeVersionLabel(appVersion)
    if (!normalized) {
      return
    }

    setSeenChangelogVersion(normalized)
    window.localStorage.setItem('holo-seen-changelog-version', normalized)
    if (globalConfigReady) {
      void getHoloApi()?.setHoloConfigValue('seen-changelog-version', normalized)
    }
  }, [appVersion, getHoloApi, globalConfigReady, setSeenChangelogVersion])

  useEffect(() => {
    if (!globalConfigReady || !appVersion || !currentVersionChangelog || showChangelogModal) {
      return
    }

    if (seenChangelogVersion === appVersion) {
      return
    }

    setSelectedChangelogVersion(appVersion)
    setShowChangelogModal(true)
  }, [appVersion, currentVersionChangelog, globalConfigReady, seenChangelogVersion, showChangelogModal])

  return {
    showChangelogModal,
    selectedChangelogEntry,
    currentVersionChangelog,
    openChangelog,
    closeChangelog,
    markCurrentVersionChangelogAsSeen,
  }
}
