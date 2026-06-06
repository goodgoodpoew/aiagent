import { history } from '@umijs/max';
import {
  LoginOutlined,
  UserAddOutlined,
  UserOutlined,
  LockOutlined,
  MailOutlined,
} from '@ant-design/icons';
import { Button, Form, Input, Segmented, Typography, message } from 'antd';
import { useState } from 'react';
import { login, register } from '@/service/auth';
import './index.css';

type AuthMode = 'login' | 'register';

interface LoginFormValues {
  account?: string;
  username?: string;
  email?: string;
  displayName?: string;
  password: string;
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<LoginFormValues>();

  const submit = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      if (mode === 'login') {
        await login({
          account: values.account || '',
          password: values.password,
        });
      } else {
        await register({
          username: values.username || '',
          email: values.email || '',
          password: values.password,
          displayName: values.displayName,
        });
      }

      message.success(mode === 'login' ? '登录成功' : '注册成功');
      history.replace('/ai/chat');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '认证失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-panel">
        <Typography.Title level={2} className="login-title">
          AI Agent
        </Typography.Title>
        <Segmented
          block
          value={mode}
          onChange={(value) => {
            setMode(value as AuthMode);
            form.resetFields();
          }}
          options={[
            { label: '登录', value: 'login', icon: <LoginOutlined /> },
            { label: '注册', value: 'register', icon: <UserAddOutlined /> },
          ]}
        />
        <Form
          className="login-form"
          form={form}
          layout="vertical"
          onFinish={submit}
          requiredMark={false}
        >
          {mode === 'login' ? (
            <Form.Item
              name="account"
              label="账号"
              rules={[{ required: true, message: '请输入用户名或邮箱' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="用户名或邮箱" />
            </Form.Item>
          ) : (
            <>
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, max: 32, message: '用户名长度为 3-32 位' },
                ]}
              >
                <Input prefix={<UserOutlined />} placeholder="demo" />
              </Form.Item>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { required: true, message: '请输入邮箱' },
                  { type: 'email', message: '邮箱格式不正确' },
                ]}
              >
                <Input prefix={<MailOutlined />} placeholder="demo@example.com" />
              </Form.Item>
              <Form.Item name="displayName" label="显示名">
                <Input prefix={<UserOutlined />} placeholder="可选" />
              </Form.Item>
            </>
          )}

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: mode === 'register' ? 8 : 1, message: '密码至少 8 位' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Button
            block
            htmlType="submit"
            icon={mode === 'login' ? <LoginOutlined /> : <UserAddOutlined />}
            loading={loading}
            type="primary"
          >
            {mode === 'login' ? '登录' : '注册'}
          </Button>
        </Form>
      </section>
    </div>
  );
}
