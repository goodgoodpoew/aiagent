import { history, Outlet, useLocation } from '@umijs/max';
import { Button, Layout, Menu, Space, Typography } from 'antd';
import {
  MessageOutlined,
  ApiOutlined,
  DatabaseOutlined,
  FileOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import { fetchCurrentUser, getCurrentStoredUser, logout } from '@/service/auth';
import { getAuthToken, hasAuthSession } from '@/service/config';
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
  const [user, setUser] = useState(() => getCurrentStoredUser());
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (isLoginPage) return;
    if (!hasAuthSession()) {
      history.replace('/login');
      return;
    }

    if (getAuthToken()) {
      fetchCurrentUser()
        .then((currentUser) => setUser(currentUser))
        .catch(() => {
          logout();
          history.replace('/login');
        });
      return;
    }

    setUser(getCurrentStoredUser());
  }, [isLoginPage, pathname]);

  const displayName = useMemo(
    () => user?.displayName || user?.username || '用户',
    [user],
  );

  if (isLoginPage) {
    return <Outlet />;
  }

  return (
    <Layout className="main-layout" style={{ height: '100vh' }}>
      <Sider
        className="main-layout-sider"
        theme="light"
        style={{
          borderRight: '1px solid #f0f0f0',
          paddingTop: 16,
          display: 'flex',
          flexDirection: 'column',
        }}
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
        <div style={{ marginTop: 'auto', padding: 12 }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text ellipsis style={{ maxWidth: 176 }}>
              {displayName}
            </Typography.Text>
            <Button
              block
              icon={<LogoutOutlined />}
              onClick={() => {
                logout();
                history.replace('/login');
              }}
            >
              登出
            </Button>
          </Space>
        </div>
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
