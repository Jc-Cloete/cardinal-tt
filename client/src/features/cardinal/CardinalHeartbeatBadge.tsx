import { Badge, Flex, Text } from '@radix-ui/themes'
import type { CardinalHeartbeat } from './types'

type CardinalHeartbeatBadgeProps = {
  heartbeat: CardinalHeartbeat | null
}

export const CardinalHeartbeatBadge = ({ heartbeat }: CardinalHeartbeatBadgeProps) => {
  if (!heartbeat) {
    return <Badge color="red">CardinalDiff: offline</Badge>
  }

  const color = heartbeat.healthy ? 'green' : 'orange'
  const suffix =
    heartbeat.secondsSinceHeartbeat === null ? 'n/a' : `${heartbeat.secondsSinceHeartbeat}s ago`

  return (
    <Flex align="center" gap="2">
      <Badge color={color}>CardinalDiff: {heartbeat.healthy ? 'healthy' : 'stale'}</Badge>
      <Text size="1" color="gray">
        {suffix}
      </Text>
    </Flex>
  )
}
