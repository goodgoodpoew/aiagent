import { Bubble } from '@ant-design/x';
import { Card, Space, Switch, Typography } from 'antd';
import { UserOutlined, RobotOutlined } from '@ant-design/icons';
import { useState } from 'react';

const { Text } = Typography;

export default function BubblePage() {
  const [typing, setTyping] = useState(false);
  const demoMessages = [
    { content: 'Hello! 这是一条来自 AI 助手的消息。', placement: 'start' as const },
    { content: '你好！我想了解 Ant Design X 的 Bubble 组件。', placement: 'end' as const },
    {
      content: 'Bubble 组件用于在聊天界面中显示消息气泡，支持多种 placement、avatar、typing 等属性。',
      placement: 'start' as const,
    },
    {
      content: '你可以自定义气泡的样式、头像、加载状态等，非常适合构建 AI 对话界面。',
      placement: 'start' as const,
    },
    { content: '太棒了，谢谢你的介绍！', placement: 'end' as const },
  ];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card
        title="Bubble 气泡"
        extra={
          <Space>
            <Text>typing 效果</Text>
            <Switch checked={typing} onChange={setTyping} />
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Bubble.List
          items={demoMessages.map((msg, i) => ({
            key: String(i),
            content: msg.content,
            placement: msg.placement,
            avatar: msg.placement === 'start' ? <RobotOutlined /> : <UserOutlined />,
            typing: i === demoMessages.length - 1 ? typing : undefined,
            role: msg.placement === 'start' ? 'assistant' : 'user',
          }))}
        />
      </Card>

      <Card title="Bubble.List 变体" style={{ marginBottom: 24 }}>
        <Bubble content="圆角气泡 - 默认样式 corr" placement="start" />
        <Bubble content="sharp 尖角风格" placement="end" shape="corner" />
        <Bubble content="round 圆角风格" placement="start" shape="round" />
      </Card>
    </div>
  );
}
