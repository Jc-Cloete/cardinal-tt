export type JiraDefaultSettings = {
  defaultProjectKey: string
  defaultStatusFilters: string[]
  defaultAssigneeFilters: string[]
}

export type AppSettings = {
  jira: JiraDefaultSettings
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  jira: {
    defaultProjectKey: '',
    defaultStatusFilters: [],
    defaultAssigneeFilters: [],
  },
}
