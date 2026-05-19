import { useEffect } from 'react'
import { extractTemplateVariables } from '../lib/appUtils'
import type { NameDialog } from '../types/shared'

type UseTemplateVariablesParams = {
  nameDialog: NameDialog | null
  appAuthor: string
  getHoloApi: () => Window['holo'] | null
  setNameDialog: React.Dispatch<React.SetStateAction<NameDialog | null>>
}

export function useTemplateVariables({
  nameDialog,
  appAuthor,
  getHoloApi,
  setNameDialog,
}: UseTemplateVariablesParams) {
  const selectedTemplatePath =
    nameDialog && nameDialog.mode === 'create-file' ? nameDialog.selectedTemplatePath ?? null : null

  useEffect(() => {
    if (!selectedTemplatePath) {
      if (nameDialog && nameDialog.mode === 'create-file' && !nameDialog.selectedTemplatePath) {
        setNameDialog((prev) =>
          prev && prev.mode === 'create-file' ? { ...prev, templateVariables: undefined } : prev,
        )
      }
      return
    }

    const holo = getHoloApi()
    if (!holo) {
      return
    }

    void holo.readFile(selectedTemplatePath).then((content: string) => {
      const variables = extractTemplateVariables(content)
      if (variables.length === 0) {
        setNameDialog((prev) =>
          prev && prev.mode === 'create-file' ? { ...prev, templateVariables: undefined } : prev,
        )
        return
      }

      const today = new Date().toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const autoValues: Record<string, string> = {}
      for (const variableName of variables) {
        if (variableName === '$DATE') {
          autoValues[variableName] = today
        } else if (variableName === '$AUTHOR' || variableName === '$AUTEUR') {
          autoValues[variableName] = appAuthor ?? ''
        } else {
          autoValues[variableName] = ''
        }
      }

      setNameDialog((prev) =>
        prev && prev.mode === 'create-file' ? { ...prev, templateVariables: autoValues } : prev,
      )
    })
  }, [selectedTemplatePath])
}
