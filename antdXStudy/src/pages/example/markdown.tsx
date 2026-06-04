import { XMarkdown } from '@ant-design/x-markdown';
import '@ant-design/x-markdown/themes/light.css';
import '@ant-design/x-markdown/themes/dark.css';
import { Button, Card, Flex, Space, Switch, Typography, theme } from 'antd';
import { useEffect, useRef, useState } from 'react';

const { Text } = Typography;

const staticContent = `# Hello XMarkdown

面向大模型输出的**流式友好** Markdown 渲染引擎。

## 特性

- 流式渲染与语法补全
- 可扩展组件映射（\`components\`）
- 支持代码高亮、公式、Mermaid 等插件

行内代码：\`npm install @ant-design/x-markdown\`

[查看官方文档](https://x.ant.design/x-markdowns/introduce)
`;

const streamText = `# Ant Design X Markdown

这是一段**模拟流式输出**的 Markdown 内容，用于演示 \`streaming.hasNextChunk\` 与尾部光标效果。

- 支持 GFM 语法
- 适合 LLM 逐字输出场景

> 点击「开始流式」查看效果。
`;

export default function MarkdownPage() {
  const { token } = theme.useToken();
  const themeClass = token.id === 0 ? 'x-markdown-light' : 'x-markdown-dark';

  const [streamIndex, setStreamIndex] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [enableAnimation, setEnableAnimation] = useState(true);
  const [showTail, setShowTail] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!streaming) return undefined;

    if (streamIndex >= streamText.length) {
      setStreaming(false);
      return undefined;
    }

    timerRef.current = setTimeout(() => {
      setStreamIndex((prev) => Math.min(prev + 2, streamText.length));
    }, 40);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [streamIndex, streaming]);

  const startStream = () => {
    setStreamIndex(0);
    setStreaming(true);
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card title="X Markdown - 基础渲染" style={{ marginBottom: 24 }}>
        <XMarkdown className={themeClass} content={staticContent} />
      </Card>

      <Card
        title="X Markdown - 流式渲染"
        extra={
          <Space>
            <Text type="secondary">动画</Text>
            <Switch size="small" checked={enableAnimation} onChange={setEnableAnimation} />
            <Text type="secondary">光标</Text>
            <Switch size="small" checked={showTail} onChange={setShowTail} />
            <Button type="primary" size="small" onClick={startStream} loading={streaming}>
              开始流式
            </Button>
          </Space>
        }
      >
        <Flex vertical gap={12}>
          <XMarkdown
            className={themeClass}
            content={streamText.slice(0, streamIndex)}
            streaming={{
              hasNextChunk: streaming,
              enableAnimation,
              tail: showTail ? { content: '▋' } : false,
            }}
          />
          <Text type="secondary">
            进度：{streamIndex} / {streamText.length}
          </Text>
        </Flex>
      </Card>
    </div>
  );
}
