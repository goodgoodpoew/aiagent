import { ThoughtChain } from '@ant-design/x';
import { Card, Button, Space } from 'antd';
import { useState } from 'react';
import {
  CheckCircleOutlined,
  LoadingOutlined,
  SearchOutlined,
  CodeOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';

export default function ThinkPage() {
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<
    { title: string; description: string; status: 'pending' | 'loading' | 'success' | 'error'; icon: React.ReactNode }[]
  >([
    { title: '理解问题', description: '', status: 'pending', icon: <SearchOutlined /> },
    { title: '查询资料', description: '', status: 'pending', icon: <DatabaseOutlined /> },
    { title: '分析计算', description: '', status: 'pending', icon: <CodeOutlined /> },
    { title: '生成回答', description: '', status: 'pending', icon: <CheckCircleOutlined /> },
  ]);

  const startThinking = async () => {
    setRunning(true);
    setItems((prev) => prev.map((item) => ({ ...item, status: 'pending' as const, description: '' })));

    const steps = [
      { index: 0, desc: '正在分析用户输入的问题...' },
      { index: 1, desc: '正在检索相关技术文档和资料...' },
      { index: 2, desc: '正在综合分析和推理计算...' },
      { index: 3, desc: '生成最终回复，包含代码示例和解释...' },
    ];

    for (const step of steps) {
      setItems((prev) =>
        prev.map((item, i) =>
          i === step.index ? { ...item, status: 'loading' as const, description: step.desc } : item,
        ),
      );
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
      setItems((prev) =>
        prev.map((item, i) =>
          i === step.index ? { ...item, status: 'success' as const } : item,
        ),
      );
    }

    setRunning(false);
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card
        title="Think 思考链 - ThoughtChain"
        extra={
          <Button type="primary" onClick={startThinking} loading={running}>
            {running ? '思考中...' : '开始演示'}
          </Button>
        }
        style={{ marginBottom: 24 }}
      >
        <ThoughtChain
          items={items.map((item) => ({
            key: item.title,
            title: item.title,
            description: item.description || undefined,
            status: item.status,
            icon: item.status === 'loading' ? <LoadingOutlined spin /> : item.icon,
          }))}
        />
      </Card>
    </div>
  );
}
