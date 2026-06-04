import { Suggestion } from '@ant-design/x';
import { Card, Space } from 'antd';

export default function SuggestionPage() {
  const quickSuggestions = [
    { label: '支持流式输出', value: 'stream' },
    { label: '多语言切换', value: 'i18n' },
    { label: '暗色模式', value: 'dark' },
  ];

  const contextSuggestions = [
    { label: '👍 写得好', value: 'good' },
    { label: '🔄 重新生成', value: 'regenerate' },
    { label: '📝 继续写完', value: 'continue' },
    { label: '📋 复制内容', value: 'copy' },
    { label: '🌐 翻译成英文', value: 'translate' },
  ];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card title="Suggestion 快捷建议" style={{ marginBottom: 24 }}>
        <Space direction="vertical" size={32} style={{ width: '100%' }}>
          <div>
            <h4>输入建议 - 消息发送前的快速提问</h4>
            <Suggestion
              items={quickSuggestions}
              onSelect={(item) => {
                console.log('选择了:', item);
              }}
            />
          </div>

          <div>
            <h4>上下文建议 - AI 回复后的操作选项</h4>
            <Suggestion
              items={contextSuggestions}
              onSelect={(item) => {
                console.log('选择了:', item);
              }}
            />
          </div>
        </Space>
      </Card>
    </div>
  );
}
