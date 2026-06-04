import type { ActionPayload, Catalog, XAgentCommand_v0_9 } from '@ant-design/x-card';
import { Box, Card as XCardSurface, registerCatalog } from '@ant-design/x-card';
import { Alert, Button, Card, Space, Typography } from 'antd';
import { useCallback, useMemo, useState } from 'react';

const CATALOG_ID = 'local://antd-x-study-catalog';

const catalog: Catalog = {
  catalogId: CATALOG_ID,
  components: {
    Text: {
      type: 'object',
      properties: { component: { const: 'Text' } },
    },
    Column: {
      type: 'object',
      properties: {
        component: { const: 'Column' },
        children: { type: 'array', items: { type: 'string' } },
      },
    },
    SubmitButton: {
      type: 'object',
      properties: {
        component: { const: 'SubmitButton' },
        child: { type: 'string' },
        action: { type: 'object' },
      },
    },
  },
};

registerCatalog(catalog);

interface TextProps {
  text?: string;
  variant?: string;
}

const Text: React.FC<TextProps> = ({ text, variant }) => {
  if (variant === 'h2') return <Typography.Title level={4}>{text}</Typography.Title>;
  return <Typography.Paragraph style={{ marginBottom: 0 }}>{text}</Typography.Paragraph>;
};

const Column: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <Space direction="vertical" size={12} style={{ width: '100%' }}>
    {children}
  </Space>
);

interface SubmitButtonProps {
  text?: string;
  children?: React.ReactNode;
  onAction?: (name: string, context: Record<string, unknown>) => void;
  action?: { event?: { name?: string; context?: Record<string, unknown> } };
}

const SubmitButton: React.FC<SubmitButtonProps> = ({ text, children, onAction, action }) => (
  <Button
    type="primary"
    onClick={() => {
      if (action?.event?.name) {
        onAction?.(action.event.name, action.event.context || {});
      }
    }}
  >
    {text || children}
  </Button>
);

const INITIAL_COMMANDS: XAgentCommand_v0_9[] = [
  {
    version: 'v0.9',
    createSurface: { surfaceId: 'demo', catalogId: CATALOG_ID },
  },
  {
    version: 'v0.9',
    updateComponents: {
      surfaceId: 'demo',
      components: [
        { id: 'title', component: 'Text', text: 'X Card 动态卡片', variant: 'h2' },
        { id: 'desc', component: 'Text', text: '基于 A2UI v0.9 协议，Agent 可通过 JSON 命令流式构建界面。' },
        {
          id: 'submit',
          component: 'SubmitButton',
          text: '点击提交',
          action: { event: { name: 'demo_submit', context: { source: 'study-demo' } } },
        },
        { id: 'root', component: 'Column', children: ['title', 'desc', 'submit'] },
      ],
    },
  },
  {
    version: 'v0.9',
    updateDataModel: {
      surfaceId: 'demo',
      path: '/demo',
      value: { ready: true },
    },
  },
];

export default function CardPage() {
  const [commands, setCommands] = useState<XAgentCommand_v0_9[]>([]);
  const [actionLog, setActionLog] = useState<string>('');

  const components = useMemo(
    () => ({ Text, Column, SubmitButton }),
    [],
  );

  const loadDemo = useCallback(() => {
    setCommands(INITIAL_COMMANDS);
    setActionLog('');
  }, []);

  const handleAction = useCallback((payload: ActionPayload) => {
    setActionLog(`事件：${payload.name}，surfaceId：${payload.surfaceId}`);
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card
        title="X Card - A2UI 动态卡片"
        extra={
          <Button type="primary" onClick={loadDemo}>
            加载演示卡片
          </Button>
        }
        style={{ marginBottom: 24 }}
      >
        <Box components={components} commands={commands} onAction={handleAction}>
          {commands.length > 0 && <XCardSurface id="demo" />}
        </Box>
        {commands.length === 0 && (
          <Typography.Text type="secondary">点击「加载演示卡片」查看 A2UI 渲染效果</Typography.Text>
        )}
        {actionLog && (
          <Alert style={{ marginTop: 16 }} type="success" message={actionLog} showIcon />
        )}
      </Card>
    </div>
  );
}
