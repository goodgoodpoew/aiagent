import { history, Outlet, useLocation } from '@umijs/max';
import { Layout, Menu } from 'antd';
import {
  AppstoreOutlined,
  MessageOutlined,
  CommentOutlined,
  SmileOutlined,
  BulbOutlined,
  LoadingOutlined,
  StarOutlined,
  SendOutlined,
  FileMarkdownOutlined,
  ApiOutlined,
  CreditCardOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  FileOutlined,
} from '@ant-design/icons';

const { Sider, Content } = Layout;

const menuItems = [
  // {
  //   key: 'example',
  //   icon: <AppstoreOutlined />,
  //   label: '示例',
  //   children: [
  //     { key: '/chat', icon: <MessageOutlined />, label: 'Chat 聊天' },
  //     { key: '/bubble', icon: <CommentOutlined />, label: 'Bubble 气泡' },
  //     { key: '/welcome', icon: <SmileOutlined />, label: 'Welcome 欢迎' },
  //     { key: '/prompt', icon: <BulbOutlined />, label: 'Prompt 提示' },
  //     { key: '/think', icon: <LoadingOutlined />, label: 'Think 思考' },
  //     { key: '/suggestion', icon: <StarOutlined />, label: 'Suggestion 建议' },
  //     { key: '/sender', icon: <SendOutlined />, label: 'Sender 发送' },
  //   ],
  // },
  // {
  //   key: 'extension',
  //   icon: <ApiOutlined />,
  //   label: '扩展',
  //   children: [
  //     { key: '/markdown', icon: <FileMarkdownOutlined />, label: 'X Markdown' },
  //     { key: '/sdk', icon: <ApiOutlined />, label: 'X SDK' },
  //     { key: '/card', icon: <CreditCardOutlined />, label: 'X Card' },
  //     { key: '/skill', icon: <ThunderboltOutlined />, label: 'X Skill' },
  //   ],
  // },
  {
    key: 'ai',
    icon: <ApiOutlined />,
    label: 'AI',
    children: [
      { key: '/ai/chat', icon: <MessageOutlined />, label: 'Chat 聊天' },
      { key: '/ai/models', icon: <DatabaseOutlined />, label: '模型管理' },
      { key: '/ai/files', icon: <FileOutlined />, label: '文件管理' },
    ],
  },
];

export default function MainLayout() {
  const { pathname } = useLocation();

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        theme="light"
        style={{ borderRight: '1px solid #f0f0f0', paddingTop: 16 }}
      >
        <div
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Ant Design X
        </div>
        <Menu
          mode="inline"
          defaultOpenKeys={['example', 'extension', 'ai']}
          selectedKeys={[pathname]}
          items={menuItems}
          onSelect={({ key }) => {
            if (typeof key === 'string' && key.startsWith('/')) {
              history.push(key);
            }
          }}
        />
      </Sider>
      <Content style={{ padding: 24, background: '#fafafa' }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
