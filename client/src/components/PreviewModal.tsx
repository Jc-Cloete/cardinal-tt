import {Cross2Icon} from '@radix-ui/react-icons'
import {Badge, Button, Dialog, Flex, Heading, Text} from '@radix-ui/themes'
import type {PreviewMessage} from '../types'
import {toRoleLabel} from '../utils/display'

type PreviewModalProps = {
  isOpen: boolean
  projectLabel: string
  previewMessages: PreviewMessage[]
  expandedMessageIds: Record<string, boolean>
  onClose: () => void
  onToggleMessage: (messageId: string) => void
}

export const PreviewModal = ({
  isOpen,
  projectLabel,
  previewMessages,
  expandedMessageIds,
  onClose,
  onToggleMessage,
}: PreviewModalProps) => (
  <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
    <Dialog.Content maxWidth="1400px" className="preview-dialog-content">
      <Flex justify="between" align="center" gap="4" mb="3">
        <div>
          <Heading size="6">Conversation Preview</Heading>
          <Text as="p" size="2" className="modal-subtitle">{projectLabel}</Text>
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
          <Text as="div" className="empty">No user/agent message entries after filters.</Text>
        ) : null}
        {previewMessages.map((message) => (
          <article key={message.id} className={`preview-item role-${message.role}`}>
            <header className="preview-item-header">
              <Badge color="gray" radius="full">{toRoleLabel(message.role)}</Badge>
              <Text size="1" className="preview-time">
                {message.timestamp ? new Date(message.timestamp).toLocaleString() : 'Unknown time'}
              </Text>
              {message.phase ? (
                <Badge color="cyan" radius="full">{message.phase}</Badge>
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
