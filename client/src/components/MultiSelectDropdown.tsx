import { Popover, Text, TextField } from '@radix-ui/themes'
import { useMemo, useState } from 'react'

type MultiSelectDropdownProps = {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  anyLabel?: string
  searchPlaceholder?: string
}

const toggleValue = (values: string[], value: string): string[] =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value]

const toSummaryText = (selected: string[], anyLabel: string): string => {
  if (selected.length === 0) {
    return anyLabel
  }
  if (selected.length === 1) {
    return selected[0] || anyLabel
  }
  return `${selected.length} selected`
}

export const MultiSelectDropdown = ({
  label,
  options,
  selected,
  onChange,
  anyLabel = 'Any',
  searchPlaceholder = 'Filter options...',
}: MultiSelectDropdownProps) => {
  const [open, setOpen] = useState<boolean>(false)
  const [query, setQuery] = useState<string>('')

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return options
    }
    return options.filter((item) => item.toLowerCase().includes(normalized))
  }, [options, query])

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setQuery('')
        }
      }}
    >
      <div className="multi-select-root">
        <Text size="2" weight="medium">
          {label} ({selected.length || anyLabel})
        </Text>
        <Popover.Trigger className="multi-select-trigger">
          <span className="multi-select-trigger-label">{toSummaryText(selected, anyLabel)}</span>
        </Popover.Trigger>
      </div>
      <Popover.Content className="multi-select-content" align="start" sideOffset={6}>
        <div className="multi-select-search">
          <TextField.Root
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </div>
        <div className="multi-select-panel-actions">
          <button
            type="button"
            className="multi-select-action"
            onClick={() => onChange(filteredOptions)}
            disabled={filteredOptions.length === 0}
          >
            Select visible
          </button>
          <button type="button" className="multi-select-action" onClick={() => onChange([])}>
            Clear
          </button>
        </div>
        <div className="multi-select-options">
          {filteredOptions.length === 0 ? (
            <Text size="1" color="gray">
              No matches
            </Text>
          ) : null}
          {filteredOptions.map((item) => (
            <label key={item} className="multi-select-option">
              <input
                type="checkbox"
                checked={selected.includes(item)}
                onChange={() => onChange(toggleValue(selected, item))}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
