import { ALL_PROJECTS, UNKNOWN_PROJECT } from '../constants'

export const getProjectDisplayName = (value?: string): string => {
  if (value === ALL_PROJECTS) {
    return 'All projects'
  }

  if (!value || value === UNKNOWN_PROJECT) {
    return 'Unknown project'
  }

  const normalized = String(value).replace(/[\\/]+$/, '')
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || normalized
}

export const toRoleLabel = (role: string): string => {
  if (role === 'assistant') {
    return 'Agent'
  }

  if (role === 'user') {
    return 'User'
  }

  return role || 'Unknown'
}
