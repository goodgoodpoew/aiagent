import { DownloadOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { type FC, useEffect } from 'react';
import { deleteManagedFile, loadFiles } from '@/store/fileThunks';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectManagedFiles } from '@/store/selectors';
import type { ChatFile } from '@/store/types';
import { downloadFile } from '@/service/file';

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
}

function renderStatus(status: string) {
  const color = status === 'ready' ? 'success' : status === 'failed' ? 'error' : 'processing';
  const labelMap: Record<string, string> = {
    ready: '已就绪',
    uploaded: '已上传',
    parsing: '解析中',
    failed: '解析失败',
  };
  return <Tag color={color}>{labelMap[status] ?? status}</Tag>;
}

const FilesPage: FC = () => {
  const dispatch = useAppDispatch();
  const files = useAppSelector(selectManagedFiles);
  const loading = useAppSelector((state) => state.files.globalLoading);
  const hasMore = useAppSelector((state) => state.files.globalHasMore);
  const statusFilter = useAppSelector((state) => state.files.statusFilter);

  useEffect(() => {
    dispatch(loadFiles());
  }, [dispatch]);

  const columns: ColumnsType<ChatFile> = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text ellipsis style={{ maxWidth: 320 }}>
            {name}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.type}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: renderStatus,
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '用途',
      dataIndex: 'purpose',
      key: 'purpose',
      width: 100,
    },
    {
      title: '会话',
      dataIndex: 'sessionCount',
      key: 'sessionCount',
      width: 90,
      render: (value: number) => `${value} 个`,
    },
    {
      title: '消息引用',
      dataIndex: 'messageCount',
      key: 'messageCount',
      width: 110,
      render: (value: number) => `${value} 次`,
    },
    {
      title: '上传时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 190,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space size={4}>
          <Button
            aria-label="下载文件"
            icon={<DownloadOutlined />}
            size="small"
            type="text"
            onClick={() => void downloadFile(record.id)}
          />
          <Popconfirm
            title="确定删除该文件？"
            onConfirm={() => dispatch(deleteManagedFile(record.id))}
          >
            <Button
              aria-label="删除文件"
              danger
              icon={<DeleteOutlined />}
              size="small"
              type="text"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
      <Space style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          文件管理
        </Typography.Title>
        <Space>
          <Select
            allowClear
            placeholder="文件状态"
            style={{ width: 140 }}
            value={statusFilter}
            options={[
              { value: 'ready', label: '已就绪' },
              { value: 'uploaded', label: '已上传' },
              { value: 'failed', label: '解析失败' },
            ]}
            onChange={(status) => dispatch(loadFiles({ status }))}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => dispatch(loadFiles({ status: statusFilter }))}
          >
            刷新
          </Button>
        </Space>
      </Space>

      <div style={{ minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #f0f0f0' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={files}
          loading={loading}
          pagination={false}
          scroll={{ x: 980 }}
        />
        {hasMore && (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <Button loading={loading} onClick={() => dispatch(loadFiles({ status: statusFilter, append: true }))}>
              加载更多
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FilesPage;
