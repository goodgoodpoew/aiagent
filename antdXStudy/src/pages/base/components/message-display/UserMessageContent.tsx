import type { FC } from 'react';
import { getMessageTextProjection } from '@/store/adapters/messageAdapter';
import type { ChatMessage } from '@/store/types';
import MessageAttachments, { type MessageAttachmentItem } from './MessageAttachments';
import MessageText from './MessageText';
import { useMessageDisplayStyle } from './messageDisplayStyle';
import './message-display.css';

interface UserMessageContentProps {
  message: ChatMessage;
}

interface AttachmentMetadata {
  attachments?: Array<{
    fileId: string;
    name: string;
    type?: string;
    size?: number;
  }>;
}

function getUserMessageAttachments(message: ChatMessage): MessageAttachmentItem[] {
  const metadata = message.metadata as AttachmentMetadata | null | undefined;

  return (metadata?.attachments ?? []).map((attachment) => ({
    id: attachment.fileId,
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
  }));
}

const UserMessageContent: FC<UserMessageContentProps> = ({ message }) => {
  const style = useMessageDisplayStyle();
  const attachments = getUserMessageAttachments(message);

  return (
    <div className="ai-message-display" style={style}>
      <MessageAttachments items={attachments} />
      <MessageText text={getMessageTextProjection(message)} />
    </div>
  );
};

export default UserMessageContent;
