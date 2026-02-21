import {ReloadIcon} from '@radix-ui/react-icons'
import {Button, Grid, Select, Text, TextField} from '@radix-ui/themes'
import {UNKNOWN_PROJECT} from '../constants'
import {getProjectDisplayName} from '../utils/display'

type ExplorerControlsProps = {
  years: string[]
  months: string[]
  days: string[]
  projects: string[]
  year: string
  month: string
  day: string
  project: string
  conversationBreakLimit: number
  isRefreshingCache: boolean
  onYearChange: (value: string) => void
  onMonthChange: (value: string) => void
  onDayChange: (value: string) => void
  onProjectChange: (value: string) => void
  onBreakLimitChange: (value: string) => void
  onRefreshCache: () => Promise<void>
}

export const ExplorerControls = ({
  years,
  months,
  days,
  projects,
  year,
  month,
  day,
  project,
  conversationBreakLimit,
  isRefreshingCache,
  onYearChange,
  onMonthChange,
  onDayChange,
  onProjectChange,
  onBreakLimitChange,
  onRefreshCache,
}: ExplorerControlsProps) => (
  <Grid columns={{initial: '1', sm: '2', lg: '3', xl: '6'}} gap="3" className="controls">
    <label className="control-field">
      <Text size="2">Year</Text>
      <Select.Root value={year || undefined} onValueChange={onYearChange}>
        <Select.Trigger placeholder="Select year" />
        <Select.Content>
          {years.map((item) => (
            <Select.Item key={item} value={item}>{item}</Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </label>

    <label className="control-field">
      <Text size="2">Month</Text>
      <Select.Root value={month || undefined} onValueChange={onMonthChange} disabled={!months.length}>
        <Select.Trigger placeholder="Select month" />
        <Select.Content>
          {months.map((item) => (
            <Select.Item key={item} value={item}>{item}</Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </label>

    <label className="control-field">
      <Text size="2">Day</Text>
      <Select.Root value={day || undefined} onValueChange={onDayChange} disabled={!days.length}>
        <Select.Trigger placeholder="Select day" />
        <Select.Content>
          {days.map((item) => (
            <Select.Item key={item} value={item}>{item}</Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </label>

    <label className="control-field">
      <Text size="2">Project Dir</Text>
      <Select.Root value={project || undefined} onValueChange={onProjectChange} disabled={!projects.length}>
        <Select.Trigger placeholder="Select project" />
        <Select.Content>
          {projects.map((item) => (
            <Select.Item key={item} value={item}>
              {item === UNKNOWN_PROJECT ? 'Unknown (missing cwd)' : getProjectDisplayName(item)}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </label>

    <label className="control-field">
      <Text size="2">conversation_break_limit (minutes)</Text>
      <TextField.Root
        type="number"
        min="1"
        step="1"
        value={String(conversationBreakLimit)}
        onChange={(event) => onBreakLimitChange(event.target.value)}
      />
    </label>

    <div className="controls-actions">
      <Button
        variant="solid"
        onClick={() => void onRefreshCache()}
        disabled={!year || !month || !day || isRefreshingCache}
      >
        <ReloadIcon width={14} height={14} />
        {isRefreshingCache ? 'Refreshing cache...' : 'Force Refresh Cache'}
      </Button>
    </div>
  </Grid>
)
