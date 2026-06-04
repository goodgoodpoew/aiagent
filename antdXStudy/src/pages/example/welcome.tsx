import { Welcome } from '@ant-design/x';
import { Card, Space } from 'antd';
import { SmileOutlined, CodeOutlined, ThunderboltOutlined } from '@ant-design/icons';

export default function WelcomePage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card title="Welcome 欢迎组件" style={{ marginBottom: 24 }}>
        <Welcome
          icon={<SmileOutlined style={{ fontSize: 48, color: '#1677ff' }} />}
          title="欢迎使用 Ant Design X"
          description="Ant Design X 是一套基于 Ant Design 的 AI 界面解决方案，提供丰富的 AI 交互组件，帮助你快速构建优秀的 AI 产品界面。"
        />
      </Card>

      <Card title="Welcome 变体展示" style={{ marginBottom: 24 }}>
        <Space direction="vertical" size={48} style={{ width: '100%' }}>
          <Welcome
            icon={<CodeOutlined style={{ fontSize: 36, color: '#52c41a' }} />}
            title="极速开发体验"
            description="开箱即用的 AI 组件，配合 Umi Max 脚手架，分钟级搭建 AI 应用界面。"
            actions={[
              { key: 'start', label: '开始使用', type: 'primary' },
              { key: 'docs', label: '查看文档' },
            ]}
          />
          <Welcome
            icon={<ThunderboltOutlined style={{ fontSize: 36, color: '#faad14' }} />}
            title="丰富的 AI 交互模式"
            description="支持流式输出、思考过程展示、智能建议等多种 AI 交互模式，满足不同场景需求。"
          />
        </Space>
      </Card>
    </div>
  );
}
