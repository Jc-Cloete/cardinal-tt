import { MoonIcon, SunIcon } from '@radix-ui/react-icons'
import { Flex, Switch, Text } from '@radix-ui/themes'
import { useThemePreference } from '../theme/ThemePreferenceProvider'

export const ThemeToggle = () => {
  const { isDark, setMode } = useThemePreference()

  return (
    <Flex align="center" gap="2">
      <SunIcon width={16} height={16} />
      <Switch
        checked={isDark}
        onCheckedChange={(checked) => setMode(checked ? 'dark' : 'light')}
        size="2"
      />
      <MoonIcon width={16} height={16} />
      <Text size="2">{isDark ? 'Dark' : 'Light'}</Text>
    </Flex>
  )
}
