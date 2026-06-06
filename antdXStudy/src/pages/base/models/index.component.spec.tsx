import { render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchProviders = vi.fn();
const fetchProvider = vi.fn();

vi.mock('@/service/platform', () => ({
  fetchProviders: (...a: unknown[]) => fetchProviders(...a),
  fetchProvider: (...a: unknown[]) => fetchProvider(...a),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  createCredential: vi.fn(),
  updateCredential: vi.fn(),
  setDefaultCredential: vi.fn(),
  validateCredential: vi.fn(),
  deleteCredential: vi.fn(),
  createModel: vi.fn(),
  updateModel: vi.fn(),
  setDefaultModel: vi.fn(),
  deleteModel: vi.fn(),
}));

import ModelManagementPage from './index';

const provider = {
  id: 'p1',
  name: 'openai',
  displayName: 'OpenAI',
  providerType: 'system',
  baseUrl: 'https://api.openai.com/v1',
  adapterType: 'openai-compatible',
  enabled: true,
  systemBuiltIn: true,
  configured: true,
  credentials: [],
  modelStats: { llm: 1 },
  createdAt: '2026-06-06T00:00:00.000Z',
  updatedAt: '2026-06-06T00:00:00.000Z',
};

const providerDetail = {
  ...provider,
  credentials: [],
  modelsByType: { llm: [] },
};

beforeEach(() => {
  fetchProviders.mockReset();
  fetchProvider.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ModelManagementPage', () => {
  it('无供应商时展示空状态引导', async () => {
    fetchProviders.mockResolvedValue([]);
    render(<ModelManagementPage />);

    expect(await screen.findByText('请选择或新增模型供应商')).toBeInTheDocument();
  });

  it('加载供应商并自动展示首个供应商详情', async () => {
    fetchProviders.mockResolvedValue([provider]);
    fetchProvider.mockResolvedValue(providerDetail);

    render(<ModelManagementPage />);

    // 左侧列表
    expect(await screen.findAllByText('OpenAI')).not.toHaveLength(0);
    // 自动加载详情
    await waitFor(() => expect(fetchProvider).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('已配置')).toBeInTheDocument();
  });

  it('加载供应商失败时提示错误', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => ({}) as ReturnType<typeof message.error>);
    fetchProviders.mockRejectedValue(new Error('boom'));

    render(<ModelManagementPage />);

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('加载模型供应商失败'));
  });
});
