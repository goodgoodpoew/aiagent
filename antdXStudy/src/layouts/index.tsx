import { history, Outlet, useLocation } from '@umijs/max';
import { Layout, Menu } from 'antd';
import {
  MessageOutlined,
  ApiOutlined,
  DatabaseOutlined,
  FileOutlined,
} from '@ant-design/icons';
import './index.css';

const { Sider, Content } = Layout;

const menuItems = [
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
    <Layout className="main-layout" style={{ height: '100vh' }}>
      <Sider
        className="main-layout-sider"
        theme="light"
        style={{ borderRight: '1px solid #f0f0f0', paddingTop: 16 }}
      >
        <div
          className="main-layout-logo"
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
          defaultOpenKeys={['ai']}
          selectedKeys={[pathname]}
          items={menuItems}
          onSelect={({ key }) => {
            if (typeof key === 'string' && key.startsWith('/')) {
              history.push(key);
            }
          }}
        />
      </Sider>
      <Content
        className="main-layout-content"
        style={{ padding: 24, background: '#fafafa', width: '100%', boxSizing: 'border-box' }}
      >
        <Outlet />
      </Content>
    </Layout>
  );
}
