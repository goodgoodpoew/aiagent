import { CheckCircleOutlined, CloseCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import { Tag, Typography } from 'antd';
import type { FC } from 'react';

export interface MessageAttachmentItem {
  id: string;
  name: string;
  type?: string;
  size?: number;
  status?: 'ready' | 'done' | 'failed';
  reason?: string;
  tokenEstimate?: number;
}

interface MessageAttachmentsProps {
  items: MessageAttachmentItem[];
  compact?: boolean;
}

function formatFileSize(size: number | undefined) {
  if (size === undefined) return '';
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function buildAttachmentMeta(item: MessageAttachmentItem, compact: boolean) {
  if (compact) return '';

  const parts: string[] = [];
  if (item.status === 'ready' || item.status === 'done') {
    parts.push('已读取');
  }
  if (item.status === 'failed') {
    parts.push('未进入上下文');
  }
  if (item.tokenEstimate !== undefined) {
    parts.push(`约 ${item.tokenEstimate} tokens`);
  } else {
    const size = formatFileSize(item.size);
    if (size) parts.push(size);
  }
  if (item.status === 'failed' && item.reason) {
    parts.push(item.reason);
  }

  return parts.join(' · ');
}

function getAttachmentTagProps(status: MessageAttachmentItem['status']) {
  if (status === 'failed') {
    return { color: 'error' as const, icon: <CloseCircleOutlined /> };
  }
  if (status === 'ready' || status === 'done') {
    return { color: 'success' as const, icon: <CheckCircleOutlined /> };
  }
  return { icon: <FileTextOutlined /> };
}

const MessageAttachments: FC<MessageAttachmentsProps> = ({ items, compact = false }) => {
  if (!items.length) return null;

  return (
    <div className="ai-message-display__attachments">
      {items.map((item) => {
        const meta = buildAttachmentMeta(item, compact);
        const tagProps = getAttachmentTagProps(item.status);

        return (
          <Tag
            key={item.id}
            {...tagProps}
            className="ai-message-display__attachment-tag"
          >
            <Typography.Text ellipsis className="ai-message-display__attachment-name">
              {item.name}
            </Typography.Text>
            {meta ? <span className="ai-message-display__attachment-meta">{meta}</span> : null}
          </Tag>
        );
      })}
    </div>
  );
};

export default MessageAttachments;
