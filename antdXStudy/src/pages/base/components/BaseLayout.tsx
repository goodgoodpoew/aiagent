import { Bubble, Sender } from '@ant-design/x';
import { Button, Empty, Popconfirm, Space, Spin, Typography, Tag, Switch, Select, Grid } from 'antd';
import {
  DeleteOutlined,
  MessageOutlined,
  PlusOutlined,
  ReloadOutlined,
  PaperClipOutlined,
  CloseOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { type FC, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  deleteCurrentSession,
  ensureSessionForUploadedFiles,
  initializeChat,
  loadSessions,
  sendCurrentMessage,
  startNewChat,
  subscribeToSessionEvents,
  switchSession,
} from '@/store/chatThunks';
import { loadSessionFiles } from '@/store/fileThunks';
import {
  setInput,
  addAttachment,
  updateAttachment,
  removeAttachment,
  clearAttachments,
  updateDraft,
} from '@/store/contentStore';
import { uploadFile } from '@/service/file';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  selectBubbleItems,
  selectCanSend,
  selectCurrentSession,
  selectCurrentSessionFiles,
  selectCurrentSessionId,
  selectSessions,
  selectStreamingState,
} from '@/store/selectors';
import type { ChatFile, ChatMessage } from '@/store/types';
import { AssistantMessageContent, UserMessageContent } from './message-display';
import './BaseLayout.css';

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
}

const BaseLayout: FC = () => {
  const dispatch = useAppDispatch();
  const screens = Grid.useBreakpoint();
  const isNarrowScreen = !screens.md;
  const sessions = useAppSelector(selectSessions);
  const currentSessionId = useAppSelector(selectCurrentSessionId);
  const currentSession = useAppSelector(selectCurrentSession);
  const sessionFiles = useAppSelector(selectCurrentSessionFiles);
  const bubbleItems = useAppSelector(selectBubbleItems);
  const canSend = useAppSelector(selectCanSend);
  const { isStreaming } = useAppSelector(selectStreamingState);
  const input = useAppSelector((state) => state.content.input);
  const attachments = useAppSelector((state) => state.content.attachments);
  const reasoning = useAppSelector((state) => state.content.reasoning);
  const locationEnabled = useAppSelector((state) => state.content.locationEnabled !== false);
  const sessionsLoading = useAppSelector((state) => state.sessions.loading);
  const messagesLoading = useAppSelector((state) =>
    currentSessionId ? state.messages.loadingBySessionId[currentSessionId] : false,
  );
  const sessionFilesLoading = useAppSelector((state) =>
    currentSessionId ? state.files.loadingBySessionId[currentSessionId] : false,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dispatch(initializeChat());
  }, [dispatch]);

  useEffect(() => {
    const unsubscribe = dispatch(subscribeToSessionEvents());
    return unsubscribe;
  }, [dispatch]);

  const bubbleRole = useMemo(
    () => ({
      assistant: {
        placement: 'start' as const,
        contentRender: (message: ChatMessage) => <AssistantMessageContent message={message} />,
      },
      user: {
        placement: 'end' as const,
        contentRender: (message: ChatMessage) => <UserMessageContent message={message} />,
      },
    }),
    [],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;

      for (const file of Array.from(files)) {
        const tempId = `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        dispatch(
          addAttachment({
            id: tempId,
            name: file.name,
            type: file.type,
            size: file.size,
            status: 'uploading',
          }),
        );

        try {
          const uploaded = await uploadFile(file);
          // uploaded=仅存储成功；ready=解析完成；failed=解析失败
          const attachmentStatus = uploaded.status === 'failed' ? 'failed' : 'ready';
          dispatch(
            updateAttachment({
              id: tempId,
              changes: {
                id: uploaded.id,
                name: uploaded.name,
                type: uploaded.type,
                size: uploaded.size,
                status: attachmentStatus,
              },
            }),
          );

          await dispatch(ensureSessionForUploadedFiles([uploaded.id], uploaded.name));
        } catch {
          dispatch(
            updateAttachment({
              id: tempId,
              changes: { status: 'failed' },
            }),
          );
        }
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [dispatch],
  );

  const renderAttachmentItem = (att: typeof attachments[number]) => {
    const statusIcon =
      att.status === 'uploading' ? (
        <LoadingOutlined spin style={{ color: '#1677ff' }} />
      ) : att.status === 'ready' ? (
        <CheckCircleOutlined style={{ color: '#52c41a' }} />
      ) : (
        <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
      );

    const statusText =
      att.status === 'uploading'
        ? '上传中'
        : att.status === 'ready'
          ? att.type === 'application/pdf'
            ? '已上传'
            : '已就绪'
          : '上传/解析失败';

    return (
      <div
        key={att.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          background: '#fafafa',
          borderRadius: 6,
          border: '1px solid #f0f0f0',
        }}
      >
        {statusIcon}
        <Typography.Text
          ellipsis
          style={{ flex: 1, minWidth: 0, fontSize: 13 }}
        >
          {att.name}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {statusText}
        </Typography.Text>
        {att.status !== 'uploading' && (
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={() => dispatch(removeAttachment(att.id))}
          />
        )}
      </div>
    );
  };

  const handleReferenceSessionFile = (file: ChatFile) => {
    if (file.status === 'failed' || attachments.some((att) => att.id === file.id)) return;
    dispatch(
      addAttachment({
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        status: file.status === 'failed' ? 'failed' : 'ready',
      }),
    );
  };

  const renderSessionFileItem = (file: ChatFile) => {
    const alreadyAttached = attachments.some((att) => att.id === file.id);
    const disabled = file.status === 'failed' || alreadyAttached || isStreaming;
    const statusColor =
      file.status === 'ready' ? 'success' : file.status === 'failed' ? 'error' : 'processing';

    return (
      <Tag
        key={file.id}
        color={statusColor}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          maxWidth: 280,
          marginBottom: 4,
          padding: '3px 6px',
        }}
      >
        <Typography.Text ellipsis style={{ maxWidth: 140, fontSize: 12 }}>
          {file.name}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {formatFileSize(file.size)}
        </Typography.Text>
        <Button
          size="small"
          type="link"
          icon={<PlusOutlined />}
          disabled={disabled}
          onClick={() => handleReferenceSessionFile(file)}
          style={{ height: 20, padding: 0, fontSize: 12 }}
        >
          {alreadyAttached ? '已引用' : '引用'}
        </Button>
      </Tag>
    );
  };

  return (
    <div
      className="ai-chat-layout"
      style={{
        display: isNarrowScreen ? 'flex' : 'grid',
        flexDirection: isNarrowScreen ? 'column' : undefined,
        gridTemplateColumns: isNarrowScreen ? undefined : '280px minmax(0, 1fr)',
        gap: isNarrowScreen ? 12 : 16,
        minHeight: isNarrowScreen ? 'auto' : 'calc(100vh - 48px)',
        height: '100%',
      }}
    >
      <aside
        className="ai-chat-session-aside"
        style={{
          background: '#fff',
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 12,
          minHeight: 0,
          height: isNarrowScreen ? 'auto' : '100%',
          width: isNarrowScreen ? '100%' : undefined,
          boxSizing: 'border-box',
        }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
          <Typography.Text strong>会话</Typography.Text>
          <Space size={4}>
            <Button
              aria-label="刷新会话"
              icon={<ReloadOutlined />}
              size="small"
              loading={sessionsLoading}
              onClick={() => dispatch(loadSessions())}
            />
            <Button
              aria-label="新建会话"
              icon={<PlusOutlined />}
              size="small"
              onClick={() => dispatch(startNewChat())}
            />
          </Space>
        </Space>
        <Spin spinning={sessionsLoading}>
          {sessions.length ? (
            <div style={{ display: 'grid', gap: 4 }}>
              {sessions.map((session) => {
                const selected = session.id === currentSessionId;
                return (
                  <div
                    key={session.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '20px minmax(0, 1fr) 32px',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      borderRadius: 6,
                      padding: '8px 10px',
                      background: selected ? '#e6f4ff' : 'transparent',
                    }}
                    onClick={() => dispatch(switchSession(session.id))}
                  >
                    <MessageOutlined />
                    <div style={{ minWidth: 0 }}>
                      <Typography.Text ellipsis style={{ display: 'block' }}>
                        {session.title || '未命名会话'}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                        {new Date(session.updatedAt).toLocaleString()}
                      </Typography.Text>
                    </div>
                    <div onClick={(event) => event.stopPropagation()}>
                      <Popconfirm
                        title="确定删除该会话？"
                        onConfirm={(event) => {
                          event?.stopPropagation();
                          dispatch(deleteCurrentSession(session.id));
                        }}
                      >
                        <Button
                          aria-label="删除会话"
                          danger
                          icon={<DeleteOutlined />}
                          size="small"
                          type="text"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </Popconfirm>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话" />
          )}
        </Spin>
      </aside>
      <main
        className="ai-chat-main"
        style={{
          background: '#fff',
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          minHeight: 0,
          height: '100%',
          width: isNarrowScreen ? '100%' : undefined,
          boxSizing: 'border-box',
        }}
      >
        <header style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text strong>{currentSession?.title || '新会话'}</Typography.Text>
            {currentSessionId && (
              <Button
                aria-label="刷新会话文件"
                icon={<ReloadOutlined />}
                size="small"
                loading={sessionFilesLoading}
                onClick={() => dispatch(loadSessionFiles(currentSessionId))}
              />
            )}
          </Space>
          {currentSessionId && (
            <div style={{ marginTop: 8 }}>
              <Space size={8} wrap>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  会话文件
                </Typography.Text>
                {sessionFiles.length ? (
                  sessionFiles.map(renderSessionFileItem)
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    暂无文件
                  </Typography.Text>
                )}
              </Space>
            </div>
          )}
        </header>
        <section
          className="ai-chat-message-section"
          style={{
            padding: 16,
            overflowY: 'auto',
            minHeight: isNarrowScreen ? 260 : 420,
            maxHeight: isNarrowScreen ? '46vh' : undefined,
            height: '100%',
          }}
        >
          <Spin spinning={Boolean(messagesLoading)}>
            {bubbleItems.length ? (
              <Bubble.List role={bubbleRole} items={bubbleItems} />
            ) : (
              <Empty description="在下方输入消息开始对话" style={{ marginTop: 120 }} />
            )}
          </Spin>
        </section>
        <footer style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}>
          {/* 附件列表 */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {attachments.map(renderAttachmentItem)}
            </div>
          )}

          <Space wrap size={8} style={{ marginBottom: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              思考
            </Typography.Text>
            <Switch
              size="small"
              checked={reasoning?.enabled !== false}
              disabled={isStreaming}
              onChange={(enabled) =>
                dispatch(
                  updateDraft({
                    reasoning: {
                      enabled,
                      effort: reasoning?.effort ?? 'medium',
                      display: reasoning?.display ?? 'summary',
                    },
                  }),
                )
              }
            />
            <Select
              size="small"
              style={{ width: 88 }}
              disabled={isStreaming || reasoning?.enabled === false}
              value={reasoning?.effort ?? 'medium'}
              options={[
                { label: '低强度', value: 'low' },
                { label: '中强度', value: 'medium' },
                { label: '高强度', value: 'high' },
              ]}
              onChange={(effort) =>
                dispatch(
                  updateDraft({
                    reasoning: {
                      enabled: reasoning?.enabled !== false,
                      effort,
                      display: reasoning?.display ?? 'summary',
                    },
                  }),
                )
              }
            />
            <Select
              size="small"
              style={{ width: 88 }}
              disabled={isStreaming || reasoning?.enabled === false}
              value={reasoning?.display ?? 'summary'}
              options={[
                { label: '隐藏', value: 'none' },
                { label: '摘要', value: 'summary' },
                { label: '完整', value: 'full' },
              ]}
              onChange={(display) =>
                dispatch(
                  updateDraft({
                    reasoning: {
                      enabled: reasoning?.enabled !== false,
                      effort: reasoning?.effort ?? 'medium',
                      display,
                    },
                  }),
                )
              }
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              强度仅对 OpenAI 等支持 reasoning_effort 的模型生效
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              位置
            </Typography.Text>
            <Switch
              size="small"
              checked={locationEnabled}
              disabled={isStreaming}
              onChange={(enabled) => dispatch(updateDraft({ locationEnabled: enabled }))}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              开启后发送消息时会请求浏览器定位，并启用位置工具
            </Typography.Text>
          </Space>

          <Sender
            loading={isStreaming}
            value={input}
            onChange={(value) => dispatch(setInput(value))}
            onSubmit={() => {
              if (canSend) {
                dispatch(sendCurrentMessage());
              }
            }}
            prefix={
              <Button
                type="text"
                icon={<PaperClipOutlined />}
                disabled={isStreaming}
                onClick={() => fileInputRef.current?.click()}
                title="添加附件"
              />
            }
          />

          {/* 隐藏的文件选择 input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.csv,.json,.pdf"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </footer>
      </main>
    </div>
  );
};

export default BaseLayout;
