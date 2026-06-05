import XMarkdown from '@ant-design/x-markdown';
import {
  BulbOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  LinkOutlined,
  LoadingOutlined,
  MinusCircleOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Collapse, Divider, Space, Tag, Typography } from 'antd';
import type { FC, ReactNode } from 'react';
import type {
  FileReadMessagePart,
  MessagePart,
  ProcessTraceMessagePart,
  ProcessTraceStatus,
  ReferenceMessagePart,
  ToolCallMessagePart,
  ToolResultMessagePart,
} from '@/service/stream-protocol';

interface AnswerProcessPanelProps {
  parts: MessagePart[];
  streaming?: boolean;
}

interface ProcessItem {
  id: string;
  title: string;
  status: ProcessTraceStatus;
  summary?: string;
  detail?: ReactNode;
  refs?: ProcessTraceMessagePart['refs'];
  icon: ReactNode;
}

function stringifyPreview(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function compactText(text: string | undefined, maxLength = 900) {
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function mapPartStatus(status: 'streaming' | 'done' | 'failed'): ProcessTraceStatus {
  if (status === 'streaming') return 'running';
  return status;
}

function mapToolStatus(
  toolCall?: ToolCallMessagePart,
  toolResult?: ToolResultMessagePart,
): ProcessTraceStatus {
  if (toolResult?.status === 'failed' || toolCall?.status === 'failed' || toolResult?.error) {
    return 'failed';
  }
  if (toolResult?.status === 'streaming' || toolCall?.status === 'running' || toolCall?.status === 'partial') {
    return 'running';
  }
  if (toolCall?.status === 'ready') return 'pending';
  return 'done';
}

function statusTag(status: ProcessTraceStatus) {
  const config: Record<ProcessTraceStatus, { text: string; color: string; icon: ReactNode }> = {
    pending: { text: '等待中', color: 'default', icon: <MinusCircleOutlined /> },
    running: { text: '进行中', color: 'processing', icon: <LoadingOutlined /> },
    done: { text: '已完成', color: 'success', icon: <CheckCircleOutlined /> },
    failed: { text: '失败', color: 'error', icon: <CloseCircleOutlined /> },
    skipped: { text: '已跳过', color: 'warning', icon: <MinusCircleOutlined /> },
    cancelled: { text: '已取消', color: 'default', icon: <ExclamationCircleOutlined /> },
  };
  const item = config[status];
  return (
    <Tag color={item.color} icon={item.icon} style={{ marginInlineEnd: 0 }}>
      {item.text}
    </Tag>
  );
}

function buildDetailBlock(label: string, value: unknown) {
  const content = compactText(stringifyPreview(value));
  if (!content) return null;

  return (
    <div>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Paragraph
        style={{
          whiteSpace: 'pre-wrap',
          marginBottom: 0,
          marginTop: 4,
          fontSize: 12,
        }}
      >
        {content}
      </Typography.Paragraph>
    </div>
  );
}

function buildFileReadItem(part: FileReadMessagePart): ProcessItem {
  const summary = part.status === 'failed'
    ? part.reason ?? '文件未进入本轮模型上下文'
    : part.tokenEstimate !== undefined
      ? `约 ${part.tokenEstimate} tokens`
      : '文件已进入本轮上下文';

  return {
    id: part.id,
    title: `读取附件：${part.name}`,
    status: mapPartStatus(part.status),
    summary,
    icon: <FileTextOutlined />,
  };
}

function buildReasoningItem(part: Extract<MessagePart, { type: 'reasoning' }>): ProcessItem | undefined {
  if (part.visibility === 'hidden' && part.status === 'done') return undefined;
  const visibleText = part.visibility === 'full' ? part.text || part.summary : part.summary;

  return {
    id: part.id,
    title: part.status === 'streaming' ? '组织回答' : '思考摘要',
    status: mapPartStatus(part.status),
    summary: visibleText || (part.status === 'streaming' ? '正在整理思路...' : '已完成思考'),
    detail: visibleText ? <XMarkdown>{visibleText}</XMarkdown> : undefined,
    icon: <BulbOutlined />,
  };
}

function buildToolItem(
  toolCall: ToolCallMessagePart,
  toolResult?: ToolResultMessagePart,
): ProcessItem {
  const status = mapToolStatus(toolCall, toolResult);
  const resultText = toolResult?.error?.message
    ?? compactText(stringifyPreview(toolResult?.result), 360);
  const args = toolCall.arguments ?? toolCall.argumentsText;
  const detailBlocks = [
    buildDetailBlock('参数摘要', args),
    buildDetailBlock(toolResult?.error ? '错误信息' : '结果摘要', toolResult?.error ?? toolResult?.result),
  ].filter(Boolean);

  return {
    id: toolCall.id,
    title: `调用工具：${toolCall.toolName}`,
    status,
    summary: resultText || (status === 'running' ? '工具正在执行' : `${toolCall.source} 工具调用已记录`),
    detail: detailBlocks.length ? <Space direction="vertical" size={8}>{detailBlocks}</Space> : undefined,
    refs: [{ type: 'tool', id: toolCall.toolCallId, title: toolCall.toolName }],
    icon: <ToolOutlined />,
  };
}

function buildProcessTraceItem(part: ProcessTraceMessagePart): ProcessItem | undefined {
  if (part.visibility === 'hidden') return undefined;

  const iconMap: Record<ProcessTraceMessagePart['traceType'], ReactNode> = {
    thinking: <BulbOutlined />,
    context: <DatabaseOutlined />,
    file_read: <FileTextOutlined />,
    knowledge_retrieval: <DatabaseOutlined />,
    mcp_resource: <DatabaseOutlined />,
    mcp_tool: <ToolOutlined />,
    builtin_tool: <ToolOutlined />,
    custom_tool: <ToolOutlined />,
    citation: <LinkOutlined />,
    system: <ExclamationCircleOutlined />,
  };

  const detail = part.visibility === 'detail'
    ? (
      <Space direction="vertical" size={8}>
        {buildDetailBlock('过程详情', part.detail)}
        {buildDetailBlock('指标', part.metrics)}
        {part.error ? buildDetailBlock('错误信息', part.error) : null}
      </Space>
    )
    : undefined;

  return {
    id: part.id,
    title: part.title,
    status: part.status,
    summary: part.error?.message ?? part.summary,
    detail,
    refs: part.refs,
    icon: iconMap[part.traceType],
  };
}

function buildReferenceItem(part: ReferenceMessagePart): ProcessItem {
  return {
    id: part.id,
    title: `引用来源：${part.title}`,
    status: 'done',
    summary: part.quote || part.uri || part.fileId,
    refs: [{
      type: part.source === 'web' ? 'web' : part.source === 'mcp' ? 'mcp' : part.source === 'session' ? 'session' : 'file',
      id: part.fileId,
      title: part.title,
      uri: part.uri,
    }],
    icon: <LinkOutlined />,
  };
}

function buildProcessItems(parts: MessagePart[]) {
  const toolResults = new Map<string, ToolResultMessagePart>();
  parts.forEach((part) => {
    if (part.type === 'tool_result') {
      toolResults.set(part.toolCallId, part);
    }
  });

  return parts.flatMap((part): ProcessItem[] => {
    if (part.type === 'process_trace') {
      const item = buildProcessTraceItem(part);
      return item ? [item] : [];
    }
    if (part.type === 'reasoning') {
      const item = buildReasoningItem(part);
      return item ? [item] : [];
    }
    if (part.type === 'file_read') return [buildFileReadItem(part)];
    if (part.type === 'tool_call') return [buildToolItem(part, toolResults.get(part.toolCallId))];
    if (part.type === 'tool_result') {
      const hasToolCall = parts.some((item) => item.type === 'tool_call' && item.toolCallId === part.toolCallId);
      if (hasToolCall) return [];
      return [buildToolItem({
        id: `${part.id}:call`,
        type: 'tool_call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        source: 'custom',
        status: part.status === 'streaming' ? 'running' : part.status,
      }, part)];
    }
    if (part.type === 'reference') return [buildReferenceItem(part)];
    if (part.type === 'error') {
      return [{
        id: part.id,
        title: '回答失败',
        status: 'failed',
        summary: part.message,
        detail: buildDetailBlock('错误码', part.code),
        icon: <CloseCircleOutlined />,
      }];
    }
    return [];
  });
}

function summarize(items: ProcessItem[]) {
  const failed = items.filter((item) => item.status === 'failed').length;
  const skipped = items.filter((item) => item.status === 'skipped').length;
  const running = items.some((item) => item.status === 'running' || item.status === 'pending');
  const done = items.filter((item) => item.status === 'done').length;
  const toolCount = items.filter((item) => item.refs?.some((ref) => ref.type === 'tool')).length;
  const sourceCount = new Set(
    items.flatMap((item) => item.refs ?? [])
      .filter((ref) => ref.type !== 'tool')
      .map((ref) => ref.id ?? ref.uri ?? ref.title),
  ).size;

  if (running) return `进行中，已完成 ${done}/${items.length} 步`;
  if (failed || skipped) return `${done} 步成功，${failed} 步失败，${skipped} 步跳过`;
  return `${items.length} 个步骤，${sourceCount} 个来源，${toolCount} 个工具`;
}

const AnswerProcessPanel: FC<AnswerProcessPanelProps> = ({ parts, streaming }) => {
  const items = buildProcessItems(parts);
  if (!items.length) return null;

  const hasProblem = items.some((item) => item.status === 'failed' || item.status === 'skipped');
  const activeKey = streaming || hasProblem ? ['process'] : undefined;
  const sourceRefs = items
    .flatMap((item) => item.refs ?? [])
    .filter((ref) => ref.type !== 'tool' && (ref.title || ref.uri || ref.id));

  return (
    <Collapse
      size="small"
      defaultActiveKey={activeKey}
      items={[
        {
          key: 'process',
          label: (
            <Space size={8} wrap>
              <Typography.Text strong>回答过程</Typography.Text>
              {statusTag(streaming ? 'running' : hasProblem ? 'failed' : 'done')}
              <Typography.Text type="secondary">{summarize(items)}</Typography.Text>
            </Space>
          ),
          children: (
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px minmax(0, 1fr)',
                    gap: 8,
                    alignItems: 'start',
                  }}
                >
                  <Typography.Text type="secondary">{item.icon}</Typography.Text>
                  <Space direction="vertical" size={4} style={{ minWidth: 0 }}>
                    <Space size={8} wrap>
                      {statusTag(item.status)}
                      <Typography.Text>{item.title}</Typography.Text>
                    </Space>
                    {item.summary ? (
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        {item.summary}
                      </Typography.Text>
                    ) : null}
                    {item.detail ? (
                      <Collapse
                        size="small"
                        ghost
                        items={[{
                          key: `${item.id}:detail`,
                          label: <Typography.Text type="secondary">查看详情</Typography.Text>,
                          children: item.detail,
                        }]}
                      />
                    ) : null}
                  </Space>
                </div>
              ))}

              {sourceRefs.length ? (
                <>
                  <Divider style={{ margin: '2px 0' }} />
                  <Space size={6} wrap>
                    <Typography.Text type="secondary">来源</Typography.Text>
                    {sourceRefs.map((ref, index) => (
                      <Tag key={`${ref.type}:${ref.id ?? ref.uri ?? ref.title}:${index}`} icon={<LinkOutlined />}>
                        {ref.title ?? ref.uri ?? ref.id}
                      </Tag>
                    ))}
                  </Space>
                </>
              ) : null}
            </Space>
          ),
        },
      ]}
    />
  );
};

export default AnswerProcessPanel;
