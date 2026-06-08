import type { FC } from 'react';
import { getMessageTextProjection } from '@/store/adapters/messageAdapter';
import type { ChatMessage } from '@/store/types';
import MessageAttachments from './MessageAttachments';
import MessageProcessPanel from './MessageProcessPanel';
import MessageText from './MessageText';
import { groupMessageParts } from './partGroups';
import { useMessageDisplayStyle } from './messageDisplayStyle';
import './message-display.css';

interface AssistantMessageContentProps {
  message: ChatMessage;
}

const AssistantMessageContent: FC<AssistantMessageContentProps> = ({ message }) => {
  const style = useMessageDisplayStyle();
  const parts = message.parts ?? [];
  const fallbackText = getMessageTextProjection(message);

  if (!parts.length) {
    return (
      <div className="ai-message-display" style={style}>
        <MessageText text={fallbackText} />
      </div>
    );
  }

  const groups = groupMessageParts(parts);
  const hasTextProjection = groups.textParts.some((part) => part.text);

  return (
    <div className="ai-message-display" style={style}>
      <MessageProcessPanel parts={groups.processParts} />
      <MessageAttachments
        compact
        items={groups.fileParts.map((part) => ({
          id: part.fileId,
          name: part.name,
          type: part.mimeType,
          size: part.size,
        }))}
      />
      {groups.textParts.map((part) => (
        <MessageText key={part.id} text={part.text} />
      ))}
      {!hasTextProjection && fallbackText ? <MessageText text={fallbackText} /> : null}
    </div>
  );
};

export default AssistantMessageContent;
