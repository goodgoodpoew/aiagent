import { Sender } from '@ant-design/x';
import { Card, Space, Switch, Typography } from 'antd';
import { useState } from 'react';

const { Text } = Typography;

export default function SenderPage() {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [allowSpeech, setAllowSpeech] = useState(true);

  const handleSubmit = async (text: string) => {
    setLoading(true);
    console.log('发送消息:', text);
    await new Promise((r) => setTimeout(r, 2000));
    setLoading(false);
    setValue('');
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card title="Sender 发送组件" style={{ marginBottom: 24 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space>
            <Text>语音输入:</Text>
            <Switch checked={allowSpeech} onChange={setAllowSpeech} />
          </Space>

          <Sender
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            loading={loading}
            allowSpeech={allowSpeech}
            placeholder="输入消息并按 Enter 发送..."
          />

          <Card title="发送记录" size="small">
            <div style={{ color: '#999' }}>
              {value ? `当前输入: ${value}` : '在上方输入框输入消息'}
            </div>
          </Card>
        </Space>
      </Card>

      <Card title="Sender 属性说明" style={{ marginBottom: 24 }}>
        <Space direction="vertical">
          <Text>
            <Text strong>onSubmit(val)</Text> - 用户提交消息时的回调
          </Text>
          <Text>
            <Text strong>loading</Text> - 发送中的加载状态
          </Text>
          <Text>
            <Text strong>allowSpeech</Text> - 是否启用语音输入
          </Text>
          <Text>
            <Text strong>placeholder</Text> - 输入框占位提示文本
          </Text>
        </Space>
      </Card>
    </div>
  );
}
