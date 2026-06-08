import type { FC } from 'react';
import type { MessagePart } from '@/service/stream-protocol';
import AnswerProcessPanel from '../AnswerProcessPanel';

interface MessageProcessPanelProps {
  parts: MessagePart[];
}

const MessageProcessPanel: FC<MessageProcessPanelProps> = ({ parts }) => (
  <AnswerProcessPanel parts={parts} />
);

export default MessageProcessPanel;
