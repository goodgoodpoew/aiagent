import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('@umijs/max', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import {
  createCredential,
  createModel,
  createProvider,
  deleteCredential,
  deleteModel,
  deleteProvider,
  fetchPlatforms,
  fetchProvider,
  fetchProviders,
  setDefaultCredential,
  setDefaultModel,
  updateCredential,
  updateModel,
  updateProvider,
  validateCredential,
} from './platform';

const BASE_URL = 'http://localhost:3001/api';

beforeEach(() => {
  requestMock.mockReset();
  requestMock.mockResolvedValue({});
});

describe('platform/model-provider service', () => {
  it('fetchProviders 与 fetchPlatforms 别名一致', () => {
    expect(fetchPlatforms).toBe(fetchProviders);
  });

  it('fetchProviders 请求列表端点', async () => {
    await fetchProviders();
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers`);
  });

  it('fetchProvider 请求详情端点', async () => {
    await fetchProvider('p1');
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1`);
  });

  it('createProvider / updateProvider / deleteProvider 走对应方法', async () => {
    await createProvider({ name: 'openai', displayName: 'OpenAI', baseUrl: 'https://api' });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers`, {
      method: 'POST',
      data: { name: 'openai', displayName: 'OpenAI', baseUrl: 'https://api' },
    });

    await updateProvider('p1', { displayName: 'OpenAI 2' });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1`, {
      method: 'PATCH',
      data: { displayName: 'OpenAI 2' },
    });

    await deleteProvider('p1');
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1`, { method: 'DELETE' });
  });

  it('凭据 CRUD 与默认/校验端点', async () => {
    await createCredential('p1', { name: '默认', config: { apiKey: 'sk' } });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1/credentials`, {
      method: 'POST',
      data: { name: '默认', config: { apiKey: 'sk' } },
    });

    await updateCredential('p1', 'c1', { name: '改名' });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1/credentials/c1`, {
      method: 'PATCH',
      data: { name: '改名' },
    });

    await setDefaultCredential('p1', 'c1');
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1/credentials/c1/default`, {
      method: 'POST',
    });

    await validateCredential('p1', 'c1');
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1/credentials/c1/validate`, {
      method: 'POST',
    });

    await deleteCredential('p1', 'c1');
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1/credentials/c1`, {
      method: 'DELETE',
    });
  });

  it('模型 CRUD 与默认端点', async () => {
    await createModel('p1', { name: 'gpt-4o', displayName: 'GPT-4o' });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1/models`, {
      method: 'POST',
      data: { name: 'gpt-4o', displayName: 'GPT-4o' },
    });

    await updateModel('p1', 'm1', { displayName: '改名' });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1/models/m1`, {
      method: 'PATCH',
      data: { displayName: '改名' },
    });

    await setDefaultModel('p1', 'm1');
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1/models/m1/default`, {
      method: 'POST',
    });

    await deleteModel('p1', 'm1');
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/model-providers/p1/models/m1`, {
      method: 'DELETE',
    });
  });
});
