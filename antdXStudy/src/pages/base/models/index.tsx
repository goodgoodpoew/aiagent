import {
  Alert,
  Badge,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ApiOutlined,
  CloudServerOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import {
  createCredential,
  createModel,
  createProvider,
  deleteCredential,
  deleteModel,
  deleteProvider,
  fetchProvider,
  fetchProviders,
  setDefaultCredential,
  setDefaultModel,
  updateCredential,
  updateModel,
  updateProvider,
  validateCredential,
  type AdapterType,
  type CredentialPayload,
  type ModelPayload,
  type ModelProvider,
  type ModelType,
  type ProviderCredential,
  type ProviderModel,
  type UpdateCredentialPayload,
  type UpdateModelPayload,
} from '@/service/platform';

const { Text, Title } = Typography;
const { TextArea } = Input;

const modelTypeTabs: Array<{ key: ModelType; label: string }> = [
  { key: 'llm', label: '聊天模型' },
  { key: 'text-embedding', label: 'Embedding' },
  { key: 'rerank', label: 'Rerank' },
  { key: 'speech-to-text', label: '语音识别' },
  { key: 'tts', label: '语音合成' },
  { key: 'image', label: '图像' },
];

const adapterOptions: Array<{ label: string; value: AdapterType }> = [
  { label: 'OpenAI-compatible', value: 'openai-compatible' },
  { label: 'Anthropic（预留）', value: 'anthropic' },
  { label: 'Gemini（预留）', value: 'gemini' },
];

function parseJsonField(value?: string) {
  if (!value?.trim()) return undefined;
  return JSON.parse(value);
}

function formatJsonField(value: unknown) {
  if (!value) return '';
  return JSON.stringify(value, null, 2);
}

function parseFeatures(value?: string) {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ModelManagementPage() {
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>();
  const [providerDetail, setProviderDetail] = useState<ModelProvider>();
  const [activeTab, setActiveTab] = useState<string>('llm');
  const [activeModelType, setActiveModelType] = useState<ModelType>('llm');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ModelProvider>();
  const [providerForm] = Form.useForm();

  const [credentialModalOpen, setCredentialModalOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<ProviderCredential>();
  const [credentialForm] = Form.useForm();

  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ProviderModel>();
  const [modelForm] = Form.useForm();

  const selectedProvider = providerDetail ?? providers.find((item) => item.id === selectedProviderId);
  const currentModels = useMemo(
    () => providerDetail?.modelsByType?.[activeModelType] ?? [],
    [activeModelType, providerDetail?.modelsByType],
  );

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProviders();
      setProviders(data);
      setSelectedProviderId((current) => current ?? data[0]?.id);
    } catch {
      message.error('加载模型供应商失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProviderDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const data = await fetchProvider(id);
      setProviderDetail(data);
    } catch {
      message.error('加载供应商详情失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshCurrent = useCallback(async () => {
    await loadProviders();
    if (selectedProviderId) {
      await loadProviderDetail(selectedProviderId);
    }
  }, [loadProviderDetail, loadProviders, selectedProviderId]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (selectedProviderId) {
      loadProviderDetail(selectedProviderId);
    } else {
      setProviderDetail(undefined);
    }
  }, [loadProviderDetail, selectedProviderId]);

  const openCreateProvider = () => {
    setEditingProvider(undefined);
    providerForm.resetFields();
    providerForm.setFieldsValue({
      enabled: true,
      providerType: 'custom',
      adapterType: 'openai-compatible',
    });
    setProviderModalOpen(true);
  };

  const openEditProvider = (provider: ModelProvider) => {
    setEditingProvider(provider);
    providerForm.setFieldsValue({
      name: provider.name,
      displayName: provider.displayName,
      providerType: provider.providerType,
      baseUrl: provider.baseUrl,
      adapterType: provider.adapterType,
      iconUrl: provider.iconUrl,
      enabled: provider.enabled,
    });
    setProviderModalOpen(true);
  };

  const handleProviderSubmit = async () => {
    const values = await providerForm.validateFields();
    try {
      if (editingProvider) {
        const { name: _, ...payload } = values;
        await updateProvider(editingProvider.id, payload);
        message.success('供应商已更新');
      } else {
        await createProvider(values);
        message.success('供应商已创建');
      }
      setProviderModalOpen(false);
      await refreshCurrent();
    } catch {
      message.error(editingProvider ? '更新供应商失败' : '创建供应商失败');
    }
  };

  const handleDeleteProvider = async (provider: ModelProvider) => {
    try {
      await deleteProvider(provider.id);
      message.success('供应商已禁用');
      setSelectedProviderId(undefined);
      await loadProviders();
    } catch {
      message.error('禁用供应商失败');
    }
  };

  const openCreateCredential = () => {
    credentialForm.resetFields();
    setEditingCredential(undefined);
    credentialForm.setFieldsValue({ enabled: true, isDefault: !selectedProvider?.credentials.length });
    setCredentialModalOpen(true);
  };

  const openEditCredential = (credential: ProviderCredential) => {
    setEditingCredential(credential);
    credentialForm.setFieldsValue({
      name: credential.name,
      apiKey: '',
      baseUrl: credential.maskedConfig.baseUrl,
      isDefault: credential.isDefault,
      enabled: credential.enabled,
    });
    setCredentialModalOpen(true);
  };

  const handleCredentialSubmit = async () => {
    if (!selectedProvider) return;
    const values = await credentialForm.validateFields();
    const config = {
      apiKey: values.apiKey,
      baseUrl: values.baseUrl,
    };

    try {
      if (editingCredential) {
        const payload: UpdateCredentialPayload = {
          name: values.name,
          isDefault: values.isDefault,
          enabled: values.enabled,
        };
        if (values.apiKey || values.baseUrl !== editingCredential.maskedConfig.baseUrl) {
          payload.config = config;
        }
        await updateCredential(selectedProvider.id, editingCredential.id, payload);
        message.success('凭据已更新');
      } else {
        const payload: CredentialPayload = {
          name: values.name,
          config,
          isDefault: values.isDefault,
          enabled: values.enabled,
        };
        await createCredential(selectedProvider.id, payload);
        message.success('凭据已创建');
      }
      setCredentialModalOpen(false);
      await refreshCurrent();
    } catch {
      message.error(editingCredential ? '更新凭据失败' : '创建凭据失败');
    }
  };

  const handleValidateCredential = async (credential: ProviderCredential) => {
    if (!selectedProvider) return;
    try {
      const result = await validateCredential(selectedProvider.id, credential.id);
      if (result.ok) {
        message.success('凭据连通性校验通过');
      } else {
        message.warning(result.error || '凭据连通性校验失败');
      }
      await refreshCurrent();
    } catch {
      message.error('凭据连通性校验失败');
    }
  };

  const handleSetDefaultCredential = async (credential: ProviderCredential) => {
    if (!selectedProvider) return;
    try {
      await setDefaultCredential(selectedProvider.id, credential.id);
      message.success('已设为默认凭据');
      await refreshCurrent();
    } catch {
      message.error('设置默认凭据失败');
    }
  };

  const handleDeleteCredential = async (credential: ProviderCredential) => {
    if (!selectedProvider) return;
    try {
      await deleteCredential(selectedProvider.id, credential.id);
      message.success('凭据已禁用');
      await refreshCurrent();
    } catch {
      message.error('禁用凭据失败');
    }
  };

  const openCreateModel = () => {
    setEditingModel(undefined);
    modelForm.resetFields();
    modelForm.setFieldsValue({
      modelType: activeModelType,
      enabled: true,
      deprecated: false,
      isDefault: currentModels.length === 0,
      features: activeModelType === 'llm' ? 'chat,stream' : '',
    });
    setModelModalOpen(true);
  };

  const openEditModel = (model: ProviderModel) => {
    setEditingModel(model);
    modelForm.setFieldsValue({
      modelType: model.modelType,
      name: model.name,
      displayName: model.displayName,
      features: Array.isArray(model.features) ? model.features.join(',') : '',
      contextSize: model.contextSize,
      maxOutput: model.maxOutput,
      defaultParameters: formatJsonField(model.defaultParameters),
      pricing: formatJsonField(model.pricing),
      deprecated: model.deprecated,
      isDefault: model.isDefault,
      enabled: model.enabled,
    });
    setModelModalOpen(true);
  };

  const handleModelSubmit = async () => {
    if (!selectedProvider) return;
    const values = await modelForm.validateFields();

    try {
      const payload = {
        modelType: values.modelType,
        displayName: values.displayName,
        features: parseFeatures(values.features),
        contextSize: values.contextSize,
        maxOutput: values.maxOutput,
        defaultParameters: parseJsonField(values.defaultParameters),
        pricing: parseJsonField(values.pricing),
        deprecated: values.deprecated,
        isDefault: values.isDefault,
        enabled: values.enabled,
      };

      if (editingModel) {
        await updateModel(selectedProvider.id, editingModel.id, payload as UpdateModelPayload);
        message.success('模型已更新');
      } else {
        await createModel(selectedProvider.id, {
          ...payload,
          name: values.name,
        } as ModelPayload);
        message.success('模型已创建');
      }
      setModelModalOpen(false);
      await refreshCurrent();
    } catch (error) {
      if (error instanceof SyntaxError) {
        message.error('JSON 字段格式不正确');
        return;
      }
      message.error(editingModel ? '更新模型失败' : '创建模型失败');
    }
  };

  const handleSetDefaultModel = async (model: ProviderModel) => {
    if (!selectedProvider) return;
    try {
      await setDefaultModel(selectedProvider.id, model.id);
      message.success('已设为默认模型');
      await refreshCurrent();
    } catch {
      message.error('设置默认模型失败');
    }
  };

  const handleDeleteModel = async (model: ProviderModel) => {
    if (!selectedProvider) return;
    try {
      await deleteModel(selectedProvider.id, model.id);
      message.success('模型已禁用');
      await refreshCurrent();
    } catch {
      message.error('禁用模型失败');
    }
  };

  const credentialColumns: ColumnsType<ProviderCredential> = [
    {
      title: '凭据名称',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space>
          <Text strong>{name}</Text>
          {record.isDefault && <Tag color="gold">默认</Tag>}
        </Space>
      ),
    },
    {
      title: '配置',
      key: 'config',
      ellipsis: true,
      render: (_, record) => (
        <Text type="secondary">
          API Key {record.maskedConfig.apiKey ? '已配置' : '未配置'}
          {record.maskedConfig.baseUrl ? ` · ${record.maskedConfig.baseUrl}` : ''}
        </Text>
      ),
    },
    {
      title: '校验',
      key: 'validation',
      width: 150,
      render: (_, record) =>
        record.lastValidationError ? (
          <Tooltip title={record.lastValidationError}>
            <Tag color="error">失败</Tag>
          </Tooltip>
        ) : record.lastValidatedAt ? (
          <Tag color="success">通过</Tag>
        ) : (
          <Tag>未校验</Tag>
        ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (enabled) => (enabled ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>),
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<ExperimentOutlined />} onClick={() => handleValidateCredential(record)}>
            测试
          </Button>
          {!record.isDefault && record.enabled && (
            <Button type="link" size="small" icon={<StarOutlined />} onClick={() => handleSetDefaultCredential(record)}>
              默认
            </Button>
          )}
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditCredential(record)} />
          <Popconfirm title="确定禁用该凭据？" onConfirm={() => handleDeleteCredential(record)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={!record.enabled} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const modelColumns: ColumnsType<ProviderModel> = [
    {
      title: '模型',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space direction="vertical" size={0}>
          <Space>
            <Text strong>{record.displayName}</Text>
            {record.isDefault && <Tag color="gold">默认</Tag>}
            {record.deprecated && <Tag color="warning">Deprecated</Tag>}
          </Space>
          <Text type="secondary">{name}</Text>
        </Space>
      ),
    },
    {
      title: '能力',
      key: 'features',
      width: 180,
      render: (_, record) =>
        Array.isArray(record.features) && record.features.length > 0 ? (
          <Space size={[4, 4]} wrap>
            {record.features.map((feature) => (
              <Tag key={feature}>{feature}</Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '上下文 / 输出',
      key: 'limits',
      width: 150,
      render: (_, record) => (
        <Text type="secondary">
          {record.contextSize ?? '-'} / {record.maxOutput ?? '-'}
        </Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (enabled) => (enabled ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>),
    },
    {
      title: '操作',
      key: 'actions',
      width: 210,
      render: (_, record) => (
        <Space size="small">
          {!record.isDefault && record.enabled && (
            <Button type="link" size="small" icon={<StarOutlined />} onClick={() => handleSetDefaultModel(record)}>
              默认
            </Button>
          )}
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModel(record)} />
          <Popconfirm title="确定禁用该模型？" onConfirm={() => handleDeleteModel(record)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={!record.enabled} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          模型管理
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateProvider}>
          新增供应商
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 16 }}>
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <Text strong>供应商</Text>
          </div>
          <div style={{ maxHeight: 'calc(100vh - 210px)', overflow: 'auto' }}>
            {providers.map((provider) => {
              const selected = provider.id === selectedProviderId;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setSelectedProviderId(provider.id)}
                  style={{
                    width: '100%',
                    border: 0,
                    borderBottom: '1px solid #f5f5f5',
                    background: selected ? '#e6f4ff' : '#fff',
                    padding: 14,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space>
                        <CloudServerOutlined />
                        <Text strong={selected}>{provider.displayName}</Text>
                      </Space>
                      <Badge status={provider.configured ? 'success' : 'default'} />
                    </Space>
                    <Text type="secondary" ellipsis>
                      {provider.name} · {provider.adapterType}
                    </Text>
                    <Space size={4} wrap>
                      <Tag color={provider.enabled ? 'success' : 'default'}>
                        {provider.enabled ? '启用' : '禁用'}
                      </Tag>
                      <Tag>{provider.modelStats.llm ?? 0} LLM</Tag>
                      {provider.systemBuiltIn && <Tag color="blue">预置</Tag>}
                    </Space>
                  </Space>
                </button>
              );
            })}
            {!loading && providers.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </div>
        </div>

        <div style={{ minWidth: 0, border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff' }}>
          {selectedProvider ? (
            <>
              <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between', alignItems: 'start' }}>
                  <Space direction="vertical" size={4}>
                    <Space>
                      <Title level={5} style={{ margin: 0 }}>
                        {selectedProvider.displayName}
                      </Title>
                      <Tag color={selectedProvider.configured ? 'success' : 'default'}>
                        {selectedProvider.configured ? '已配置' : '未配置'}
                      </Tag>
                      <Tag>{selectedProvider.adapterType}</Tag>
                    </Space>
                    <Text type="secondary">
                      {selectedProvider.name} · {selectedProvider.baseUrl || '未设置 Base URL'}
                    </Text>
                  </Space>
                  <Space>
                    <Button icon={<EditOutlined />} onClick={() => openEditProvider(selectedProvider)}>
                      编辑
                    </Button>
                    <Popconfirm title="确定禁用该供应商？" onConfirm={() => handleDeleteProvider(selectedProvider)}>
                      <Button danger icon={<DeleteOutlined />} disabled={!selectedProvider.enabled}>
                        禁用
                      </Button>
                    </Popconfirm>
                  </Space>
                </Space>
              </div>

              {selectedProvider.adapterType !== 'openai-compatible' && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ margin: 16, marginBottom: 0 }}
                  message="该供应商为原生适配器预留项，当前聊天代理暂不转发其原生协议。"
                />
              )}

              <Tabs
                activeKey={activeTab}
                onChange={(key) => {
                  setActiveTab(key);
                  if (key !== 'credentials') {
                    setActiveModelType(key as ModelType);
                  }
                }}
                style={{ padding: '0 16px 16px' }}
                tabBarExtraContent={
                  <Space>
                    <Button icon={<ApiOutlined />} onClick={openCreateCredential}>
                      新增凭据
                    </Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModel}>
                      新增模型
                    </Button>
                  </Space>
                }
                items={[
                  {
                    key: 'credentials',
                    label: '凭据',
                    children: (
                      <Table
                        rowKey="id"
                        loading={detailLoading}
                        columns={credentialColumns}
                        dataSource={selectedProvider.credentials}
                        pagination={false}
                        size="middle"
                      />
                    ),
                  },
                  ...modelTypeTabs.map((tab) => ({
                    key: tab.key,
                    label: `${tab.label} (${selectedProvider.modelStats?.[tab.key] ?? 0})`,
                    children: (
                      <Table
                        rowKey="id"
                        loading={detailLoading}
                        columns={modelColumns}
                        dataSource={providerDetail?.modelsByType?.[tab.key] ?? []}
                        pagination={false}
                        size="middle"
                        locale={{ emptyText: '暂无模型' }}
                      />
                    ),
                  })),
                ]}
              />
            </>
          ) : (
            <Empty style={{ padding: 80 }} description="请选择或新增模型供应商" />
          )}
        </div>
      </div>

      <Modal
        title={editingProvider ? '编辑供应商' : '新增供应商'}
        open={providerModalOpen}
        onOk={handleProviderSubmit}
        onCancel={() => setProviderModalOpen(false)}
        destroyOnHidden
      >
        <Form form={providerForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="供应商标识" rules={[{ required: true, message: '请输入供应商标识' }]}>
            <Input placeholder="如 openai、deepseek" disabled={!!editingProvider} />
          </Form.Item>
          <Form.Item name="displayName" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
            <Input placeholder="如 OpenAI" />
          </Form.Item>
          <Form.Item name="baseUrl" label="Base URL">
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item name="adapterType" label="适配器" rules={[{ required: true, message: '请选择适配器' }]}>
            <Select options={adapterOptions} />
          </Form.Item>
          <Form.Item name="providerType" label="供应商类型">
            <Select
              options={[
                { label: '系统预置', value: 'system' },
                { label: '自定义', value: 'custom' },
              ]}
            />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingCredential ? '编辑凭据' : '新增凭据'}
        open={credentialModalOpen}
        onOk={handleCredentialSubmit}
        onCancel={() => setCredentialModalOpen(false)}
        destroyOnHidden
      >
        <Form form={credentialForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="凭据名称" rules={[{ required: true, message: '请输入凭据名称' }]}>
            <Input placeholder="如 默认凭据、备用 Key" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[{ required: !editingCredential, message: '请输入 API Key' }]}
            extra={editingCredential ? '留空表示不修改当前密钥。' : undefined}
          >
            <Input.Password placeholder={editingCredential ? '保持当前密钥' : 'sk-...'} />
          </Form.Item>
          <Form.Item name="baseUrl" label="覆盖 Base URL">
            <Input placeholder={selectedProvider?.baseUrl || '可选'} />
          </Form.Item>
          <Form.Item name="isDefault" label="设为默认" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingModel ? '编辑模型' : '新增模型'}
        open={modelModalOpen}
        onOk={handleModelSubmit}
        onCancel={() => setModelModalOpen(false)}
        destroyOnHidden
        width={640}
      >
        <Form form={modelForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="modelType" label="模型类型" rules={[{ required: true, message: '请选择模型类型' }]}>
            <Select options={modelTypeTabs.map((item) => ({ label: item.label, value: item.key }))} />
          </Form.Item>
          <Form.Item name="name" label="模型标识" rules={[{ required: true, message: '请输入模型标识' }]}>
            <Input placeholder="如 gpt-4o-mini" disabled={!!editingModel} />
          </Form.Item>
          <Form.Item name="displayName" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
            <Input placeholder="如 GPT-4o Mini" />
          </Form.Item>
          <Form.Item name="features" label="能力标签">
            <Input placeholder="chat,stream,vision" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="contextSize" label="上下文窗口" style={{ flex: 1 }}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxOutput" label="最大输出" style={{ flex: 1 }}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="defaultParameters" label="默认参数 JSON">
            <TextArea rows={3} placeholder={'{"temperature":0.7}'} />
          </Form.Item>
          <Form.Item name="pricing" label="价格 JSON">
            <TextArea rows={3} placeholder={'{"input":0,"output":0,"unit":"1M tokens"}'} />
          </Form.Item>
          <Space size={24}>
            <Form.Item name="isDefault" label="设为默认" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="deprecated" label="Deprecated" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
