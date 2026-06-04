import { Card, Col, Row, Steps, Typography } from 'antd';
import {
  CodeOutlined,
  RocketOutlined,
  ToolOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text, Link } = Typography;

const installSteps = [
  {
    title: '全局安装',
    description: 'npm i -g @ant-design/x-skill',
  },
  {
    title: '注册到 IDE',
    description: '在项目根目录执行 npx x-skill',
  },
  {
    title: '在 Cursor 中使用',
    description: 'Agent 将自动加载 Ant Design X 最佳实践技能',
  },
];

const skillScenarios = [
  {
    icon: <RocketOutlined style={{ fontSize: 28, color: '#1677ff' }} />,
    title: '新项目搭建',
    description: '快速脚手架 Ant Design X 项目结构、路由与 Provider 配置',
  },
  {
    icon: <CodeOutlined style={{ fontSize: 28, color: '#52c41a' }} />,
    title: '组件开发',
    description: 'Bubble、Sender、useXChat 等组件的用法与代码示例',
  },
  {
    icon: <ToolOutlined style={{ fontSize: 28, color: '#faad14' }} />,
    title: '问题排查',
    description: '流式渲染、Provider 接入、样式兼容等常见问题诊断',
  },
];

export default function SkillPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card title="X Skill - 智能技能库" style={{ marginBottom: 24 }}>
        <Paragraph>
          <Text strong>@ant-design/x-skill</Text> 是面向 Ant Design X 的 Agent
          技能库，面向 Cursor、Claude Code 等 IDE，帮助你在开发时获得官方最佳实践与示例代码。
          它<strong>不是</strong> React 运行时组件，需在本地或 IDE 中安装使用。
        </Paragraph>

        <Title level={5} style={{ marginTop: 24 }}>
          安装步骤
        </Title>
        <Steps direction="vertical" size="small" current={-1} items={installSteps} />

        <Title level={5} style={{ marginTop: 24 }}>
          常用命令
        </Title>
        <pre
          style={{
            background: '#f5f5f5',
            padding: 16,
            borderRadius: 8,
            fontSize: 13,
            overflow: 'auto',
          }}
        >
{`# 安装最新版
npm i -g @ant-design/x-skill
npx x-skill

# 查看版本
x-skill --list-versions

# 安装指定版本
x-skill --tag 2.7.0`}
        </pre>

        <Title level={5} style={{ marginTop: 24 }}>
          适用场景
        </Title>
        <Row gutter={[16, 16]}>
          {skillScenarios.map((item) => (
            <Col span={24} key={item.title}>
              <Card size="small">
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {item.icon}
                  <div>
                    <Text strong>{item.title}</Text>
                    <br />
                    <Text type="secondary">{item.description}</Text>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        <Paragraph style={{ marginTop: 24, marginBottom: 0 }}>
          更多技能列表与 Claude 插件安装方式，见{' '}
          <Link href="https://x.ant.design/x-skills/introduce" target="_blank">
            官方文档
          </Link>
          。
        </Paragraph>
      </Card>
    </div>
  );
}
