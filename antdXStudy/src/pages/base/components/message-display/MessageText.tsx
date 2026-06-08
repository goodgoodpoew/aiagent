import XMarkdown from '@ant-design/x-markdown';
import type { FC } from 'react';

interface MessageTextProps {
  text: string;
  className?: string;
}

const MessageText: FC<MessageTextProps> = ({ text, className }) => (
  <div className={className ?? 'ai-message-display__text'}>
    <XMarkdown>{text}</XMarkdown>
  </div>
);

export default MessageText;
