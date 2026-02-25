import { Badge, Button, Card, Flex, Heading, Select, Text } from '@radix-ui/themes'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MultiSelectDropdown } from '../../components/MultiSelectDropdown'
import { API } from '../../constants'
import { useToast } from '../../notifications/ToastProvider'
import { clientLogger } from '../../observability/logger'
import { fetchJson } from '../../utils/fetch'
import type { JiraFilterOptionsResponse } from '../jira/types'
import type { JiraDefaultSettings } from './types'

const settingsPageLogger = clientLogger.child({ component: 'settings-page' })
const NO_DEFAULT_PROJECT = '__none__'

type SettingsPageProps = {
  jiraDefaults: JiraDefaultSettings
  onSaveJiraDefaults: (defaults: JiraDefaultSettings) => void
  onResetAllSettings: () => void
}

const normalizeFilters = (values: string[], options: string[]): string[] =>
  values.filter((value) => options.includes(value))

const normalizeProject = (value: string, options: string[]): string =>
  value && options.includes(value) ? value : ''

export const SettingsPage = ({
  jiraDefaults,
  onSaveJiraDefaults,
  onResetAllSettings,
}: SettingsPageProps) => {
  const { success: showSuccessToast, error: showErrorToast, info: showInfoToast } = useToast()
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [options, setOptions] = useState<JiraFilterOptionsResponse | null>(null)
  const [draft, setDraft] = useState<JiraDefaultSettings>(jiraDefaults)

  useEffect(() => {
    setDraft(jiraDefaults)
  }, [jiraDefaults])

  const projectOptions = useMemo(
    () =>
      (options?.projects || [])
        .map((project) => project.projectKey)
        .sort((a, b) => a.localeCompare(b)),
    [options?.projects],
  )
  const statusOptions = useMemo(
    () => (options?.statuses || []).slice().sort((a, b) => a.localeCompare(b)),
    [options?.statuses],
  )
  const assigneeOptions = useMemo(
    () => (options?.assignees || []).slice().sort((a, b) => a.localeCompare(b)),
    [options?.assignees],
  )

  const loadOptions = useCallback(
    async (forceRefresh: boolean, notify: boolean): Promise<void> => {
      setLoading(true)
      try {
        const response = await fetchJson<JiraFilterOptionsResponse>(
          `${API}/jira/filter-options${forceRefresh ? '?refresh=1' : ''}`,
        )
        setOptions(response)
        setDraft((prev) => ({
          defaultProjectKey: normalizeProject(
            prev.defaultProjectKey,
            response.projects.map((project) => project.projectKey),
          ),
          defaultStatusFilters: normalizeFilters(prev.defaultStatusFilters, response.statuses),
          defaultAssigneeFilters: normalizeFilters(prev.defaultAssigneeFilters, response.assignees),
        }))
        setError('')
        settingsPageLogger.log({
          event: 'client.settings.jira_options.loaded',
          fields: {
            force_refresh: forceRefresh,
            source: response.source,
            stale: response.stale,
            project_count: response.projects.length,
            status_count: response.statuses.length,
            assignee_count: response.assignees.length,
          },
        })
        if (notify) {
          showSuccessToast(
            forceRefresh ? 'Jira options force refreshed' : 'Jira options reloaded',
            `${response.projects.length} projects, ${response.statuses.length} statuses, ${response.assignees.length} assignees`,
          )
        }
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : String(requestError || '')
        setError(message)
        if (notify) {
          showErrorToast('Failed to load Jira options', message)
        }
        settingsPageLogger.log({
          event: 'client.settings.jira_options.load_failed',
          level: 'warn',
          outcome: 'error',
          error: message,
          fields: {
            force_refresh: forceRefresh,
          },
        })
      } finally {
        setLoading(false)
      }
    },
    [showErrorToast, showSuccessToast],
  )

  useEffect(() => {
    void loadOptions(false, false)
  }, [loadOptions])

  return (
    <Card className="card">
      <Heading size="6" mb="3">
        Settings
      </Heading>

      <Card variant="surface">
        <Heading size="4" mb="2">
          Jira Defaults
        </Heading>

        <Flex gap="2" mb="3" wrap="wrap">
          {options ? (
            <Badge color={options.stale ? 'orange' : 'green'}>
              Source: {options.source} · {options.stale ? 'stale' : 'fresh'}
            </Badge>
          ) : null}
          <Button variant="soft" onClick={() => void loadOptions(false, true)} disabled={loading}>
            Reload Options
          </Button>
          <Button onClick={() => void loadOptions(true, true)} disabled={loading}>
            Force Refresh Options
          </Button>
        </Flex>

        {error ? (
          <Text as="p" size="2" color="red" mb="2">
            {error}
          </Text>
        ) : null}

        <div className="control-field">
          <Text size="2">Default project</Text>
          <Select.Root
            value={draft.defaultProjectKey || NO_DEFAULT_PROJECT}
            onValueChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                defaultProjectKey: value === NO_DEFAULT_PROJECT ? '' : value,
              }))
            }
          >
            <Select.Trigger />
            <Select.Content>
              <Select.Item value={NO_DEFAULT_PROJECT}>No default project</Select.Item>
              {projectOptions.map((projectKey) => (
                <Select.Item key={projectKey} value={projectKey}>
                  {projectKey}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>

        <Flex gap="2" wrap="wrap" mt="3">
          <MultiSelectDropdown
            label="Default status filters"
            options={statusOptions}
            selected={draft.defaultStatusFilters}
            onChange={(next) =>
              setDraft((prev) => ({
                ...prev,
                defaultStatusFilters: next,
              }))
            }
            anyLabel="Any"
            searchPlaceholder="Search statuses..."
          />
          <MultiSelectDropdown
            label="Default assignee filters"
            options={assigneeOptions}
            selected={draft.defaultAssigneeFilters}
            onChange={(next) =>
              setDraft((prev) => ({
                ...prev,
                defaultAssigneeFilters: next,
              }))
            }
            anyLabel="Any"
            searchPlaceholder="Search assignees..."
          />
        </Flex>

        <Flex gap="2" mt="3" justify="end">
          <Button
            variant="soft"
            onClick={() => {
              setDraft(jiraDefaults)
            }}
          >
            Revert
          </Button>
          <Button
            variant="soft"
            onClick={() => {
              onResetAllSettings()
              setDraft({
                defaultProjectKey: '',
                defaultStatusFilters: [],
                defaultAssigneeFilters: [],
              })
              showInfoToast('Settings reset', 'All defaults have been cleared.')
            }}
          >
            Reset All Settings
          </Button>
          <Button
            onClick={() => {
              onSaveJiraDefaults({
                defaultProjectKey: normalizeProject(draft.defaultProjectKey, projectOptions),
                defaultStatusFilters: normalizeFilters(draft.defaultStatusFilters, statusOptions),
                defaultAssigneeFilters: normalizeFilters(
                  draft.defaultAssigneeFilters,
                  assigneeOptions,
                ),
              })
              showSuccessToast('Settings saved', 'Default Jira filters are now active.')
            }}
          >
            Save Jira Defaults
          </Button>
        </Flex>
      </Card>
    </Card>
  )
}
