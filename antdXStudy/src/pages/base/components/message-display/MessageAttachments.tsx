import { FileTextOutlined } from '@ant-design/icons';
import { Tag, Typography } from 'antd';
import type { FC } from 'react';

export interface MessageAttachmentItem {
  id: string;
  name: string;
  type?: string;
  size?: number;
  status?: string;
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

const MessageAttachments: FC<MessageAttachmentsProps> = ({ items, compact = false }) => {
  if (!items.length) return null;

  return (
    <div className="ai-message-display__attachments">
      {items.map((item) => {
        const meta = compact ? '' : formatFileSize(item.size);

        return (
          <Tag
            key={item.id}
            icon={<FileTextOutlined />}
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
