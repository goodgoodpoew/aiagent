import XMarkdown from '@ant-design/x-markdown';
import { Space, Tag } from 'antd';
import type { FC } from 'react';
import { getMessageTextProjection } from '@/store/adapters/messageAdapter';
import type { ChatMessage } from '@/store/types';
import AnswerProcessPanel from './AnswerProcessPanel';

interface MessagePartsRendererProps {
  message: ChatMessage;
}

const MessagePartsRenderer: FC<MessagePartsRendererProps> = ({ message }) => {
  const parts = message.parts ?? [];

  if (!parts.length) {
    return <XMarkdown>{getMessageTextProjection(message)}</XMarkdown>;
  }

  // 后端 v2 协议把 assistant 输出拆成多个 part：
  // text 是最终回答，reasoning/tool/file_read/reference/error 等辅助过程统一进入回答过程面板。
  const textParts = parts.filter((part) => part.type === 'text');
  const fileParts = parts.filter((part) => part.type === 'file');
  const hasTextProjection = textParts.some((part) => part.text);

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <AnswerProcessPanel parts={parts} streaming={message.status === 'streaming'} />
      {fileParts.length ? (
        <Space size={6} wrap>
          {fileParts.map((part) => <Tag key={part.id}>{part.name}</Tag>)}
        </Space>
      ) : null}
      {textParts.map((part) => (
        <XMarkdown key={part.id}>{part.text}</XMarkdown>
      ))}
      {!hasTextProjection ? <XMarkdown>{getMessageTextProjection(message)}</XMarkdown> : null}
    </Space>
  );
};

export default MessagePartsRenderer;
