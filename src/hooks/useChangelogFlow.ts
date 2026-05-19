import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeVersionLabel } from '../lib/appUtils'
import type { ChangelogEntry } from '../types/shared'

type UseChangelogFlowParams = {
  changelogEntries: ChangelogEntry[]
  appVersion: string
  globalConfigReady: boolean
  seenChangelogVersion: string
  setSeenChangelogVersion: React.Dispatch<React.SetStateAction<string>>
  getHoloApi: () => Window['holo'] | null
}

export function useChangelogFlow({
  changelogEntries,
  appVersion,
  globalConfigReady,
  seenChangelogVersion,
  setSeenChangelogVersion,
  getHoloApi,
}: UseChangelogFlowParams) {
  const [showChangelogModal, setShowChangelogModal] = useState(false)
  const [selectedChangelogVersion, setSelectedChangelogVersion] = useState<string | null>(null)

  const selectedChangelogEntry = useMemo(
    () => changelogEntries.find((entry) => entry.version === selectedChangelogVersion) ?? null,
    [changelogEntries, selectedChangelogVersion],
  )

  const currentVersionChangelog = useMemo(
    () => changelogEntries.find((entry) => entry.version === appVersion) ?? null,
    [appVersion, changelogEntries],
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
