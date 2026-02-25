import { Cross2Icon } from '@radix-ui/react-icons'
import { Badge, Button, Dialog, Flex, Heading, Text } from '@radix-ui/themes'
import type { CardinalProject } from '../features/cardinal/types'
import type { PreviewMessage } from '../types'
import { toRoleLabel } from '../utils/display'

type PreviewModalProps = {
  isOpen: boolean
  projectPath: string
  projectLabel: string
  trackedProject: CardinalProject | null
  trackingBusy: boolean
  previewMessages: PreviewMessage[]
  expandedMessageIds: Record<string, boolean>
  onTrackProject: (projectPath: string) => Promise<void>
  onUntrackProject: (projectId: string) => Promise<void>
  onClose: () => void
  onToggleMessage: (messageId: string) => void
}

export const PreviewModal = ({
  isOpen,
  projectPath,
  projectLabel,
  trackedProject,
  trackingBusy,
  previewMessages,
  expandedMessageIds,
  onTrackProject,
  onUntrackProject,
  onClose,
  onToggleMessage,
}: PreviewModalProps) => (
  // Separate modal keeps timeline area dense while still allowing deep preview inspection.
  <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
    <Dialog.Content maxWidth="1400px" className="preview-dialog-content">
      <Dialog.Title className="visually-hidden">Conversation Preview</Dialog.Title>
      <Flex justify="between" align="center" gap="4" mb="3">
        <div>
          <Heading size="6">Conversation Preview</Heading>
          <Text as="p" size="2" className="modal-subtitle">
            {projectLabel}
          </Text>
          {projectPath ? (
            <Text as="p" size="1" className="modal-subtitle">
              {projectPath}
            </Text>
          ) : null}
          <Flex align="center" gap="2" mt="2">
            <Badge color={trackedProject ? 'green' : 'gray'}>
              {trackedProject ? 'Tracked by CardinalDiff' : 'Not tracked by CardinalDiff'}
            </Badge>
            {projectPath ? (
              trackedProject ? (
                <Button
                  size="1"
                  variant="soft"
                  color="red"
                  disabled={trackingBusy}
                  onClick={() => void onUntrackProject(trackedProject.projectId)}
                >
                  Remove Tracking
                </Button>
              ) : (
                <Button
                  size="1"
                  variant="soft"
                  disabled={trackingBusy}
                  onClick={() => void onTrackProject(projectPath)}
                >
                  Add Tracking
                </Button>
              )
            ) : null}
          </Flex>
        </div>
        <Dialog.Close>
          <Button variant="soft" color="gray" onClick={onClose}>
            <Cross2Icon width={14} height={14} />
            Close
          </Button>
        </Dialog.Close>
      </Flex>
      <div className="preview-feed modal-feed">
        {previewMessages.length === 0 ? (
          <Text as="div" className="empty">
            No user/agent message entries after filters.
          </Text>
        ) : null}
        {previewMessages.map((message) => (
          <article key={message.id} className={`preview-item role-${message.role}`}>
            <header className="preview-item-header">
              <Badge color="gray" radius="full">
                {toRoleLabel(message.role)}
              </Badge>
              <Text size="1" className="preview-time">
                {message.timestamp ? new Date(message.timestamp).toLocaleString() : 'Unknown time'}
              </Text>
              {message.phase ? (
                <Badge color="cyan" radius="full">
                  {message.phase}
                </Badge>
              ) : null}
            </header>
            <div
              className={`preview-blocks ${expandedMessageIds[message.id] ? 'expanded' : 'collapsed'}`}
            >
              <p>{message.text}</p>
            </div>
            {message.lineCount > 3 ? (
              <Button
                variant="soft"
                size="1"
                className="preview-toggle"
                onClick={() => onToggleMessage(message.id)}
              >
                {expandedMessageIds[message.id] ? 'Collapse' : 'Expand'}
              </Button>
            ) : null}
          </article>
        ))}
      </div>
    </Dialog.Content>
  </Dialog.Root>
)
