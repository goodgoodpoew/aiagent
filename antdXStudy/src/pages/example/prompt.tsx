import { Prompts } from '@ant-design/x';
import { Card, Space } from 'antd';
import {
  CodeOutlined,
  FileTextOutlined,
  TranslationOutlined,
  BugOutlined,
  PictureOutlined,
  SearchOutlined,
} from '@ant-design/icons';

export default function PromptPage() {
  const textPrompts = {
    items: [
      {
        key: 'code',
        label: '帮我写一段代码',
        icon: <CodeOutlined />,
        description: '用 TypeScript 实现一个排序算法',
      },
      {
        key: 'article',
        label: '写一篇文章',
        icon: <FileTextOutlined />,
        description: '关于 React 18 新特性的介绍',
      },
      {
        key: 'translate',
        label: '翻译文本',
        icon: <TranslationOutlined />,
        description: '将中文翻译成英文',
      },
      {
        key: 'debug',
        label: '调试代码',
        icon: <BugOutlined />,
        description: '帮我找出这段代码的问题',
      },
      {
        key: 'image',
        label: '生成图片描述',
        icon: <PictureOutlined />,
        description: '为图片生成详细的描述文本',
      },
      {
        key: 'research',
        label: '搜索资料',
        icon: <SearchOutlined />,
        description: '帮我查找最新的技术资料',
      },
    ],
  };

  const simplePrompts = {
    items: ['什么是 React？', '写一个快速排序', '解释闭包原理', 'Vue 和 React 的区别'],
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card title="Prompts 提示 - 完整模式" style={{ marginBottom: 24 }}>
        <Prompts
          title="你可以这样问我："
          items={textPrompts.items}
          onItemClick={(info) => {
            console.log('点击了提示:', info);
          }}
        />
      </Card>

      <Card title="Prompts 提示 - 简洁模式" style={{ marginBottom: 24 }}>
        <Prompts
          title="快捷问题"
          items={simplePrompts.items}
          onItemClick={(info) => {
            console.log('点击了:', info);
          }}
        />
      </Card>
    </div>
  );
}
