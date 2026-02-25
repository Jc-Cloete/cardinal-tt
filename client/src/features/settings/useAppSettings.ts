import { useCallback, useEffect, useMemo, useState } from 'react'
import { clientLogger } from '../../observability/logger'
import type { JsonValue } from '../../types'
import { type AppSettings, DEFAULT_APP_SETTINGS, type JiraDefaultSettings } from './types'

const settingsLogger = clientLogger.child({ component: 'use-app-settings' })

const STORAGE_KEY = 'cardinal-tt.app-settings'

const asStringArray = (value: JsonValue | undefined): string[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
}

const readStoredSettings = (): AppSettings => {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_SETTINGS
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return DEFAULT_APP_SETTINGS
  }

  try {
    const parsed = JSON.parse(raw) as {
      jira?: {
        defaultProjectKey?: string
        defaultStatusFilters?: string[]
        defaultAssigneeFilters?: string[]
      }
    }

    return {
      jira: {
        defaultProjectKey:
          typeof parsed.jira?.defaultProjectKey === 'string' ? parsed.jira.defaultProjectKey : '',
        defaultStatusFilters: asStringArray(parsed.jira?.defaultStatusFilters),
        defaultAssigneeFilters: asStringArray(parsed.jira?.defaultAssigneeFilters),
      },
    }
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

type UseAppSettingsResult = {
  settings: AppSettings
  setJiraDefaults: (defaults: JiraDefaultSettings) => void
  resetSettings: () => void
}

export const useAppSettings = (): UseAppSettingsResult => {
  const [settings, setSettings] = useState<AppSettings>(() => readStoredSettings())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    settingsLogger.log({
      event: 'client.settings.persisted',
      fields: {
        has_default_project: Boolean(settings.jira.defaultProjectKey),
        default_status_count: settings.jira.defaultStatusFilters.length,
        default_assignee_count: settings.jira.defaultAssigneeFilters.length,
      },
    })
  }, [settings])

  const setJiraDefaults = useCallback((defaults: JiraDefaultSettings): void => {
    setSettings((prev) => ({
      ...prev,
      jira: {
        defaultProjectKey: defaults.defaultProjectKey.trim(),
        defaultStatusFilters: Array.from(
          new Set(defaults.defaultStatusFilters.map((item) => item.trim())),
        ),
        defaultAssigneeFilters: Array.from(
          new Set(defaults.defaultAssigneeFilters.map((item) => item.trim())),
        ),
      },
    }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_APP_SETTINGS)
  }, [])

  return useMemo(
    () => ({
      settings,
      setJiraDefaults,
      resetSettings,
    }),
    [settings, setJiraDefaults, resetSettings],
  )
}
