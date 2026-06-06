import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchFiles = vi.fn();
const deleteFile = vi.fn();

vi.mock('@/service/file', () => ({
  fetchFiles: (...a: unknown[]) => fetchFiles(...a),
  deleteFile: (...a: unknown[]) => deleteFile(...a),
  getFileDownloadUrl: (id: string) => `http://localhost:3001/api/files/${id}/download`,
}));

import { contentReducer } from '@/store/contentStore';
import { fileReducer } from '@/store/fileStore';
import { messageReducer } from '@/store/messageStore';
import { sessionReducer } from '@/store/sessionStore';
import FilesPage from './index';

function renderPage() {
  const store = configureStore({
    reducer: {
      sessions: sessionReducer,
      messages: messageReducer,
      content: contentReducer,
      files: fileReducer,
    },
  });
  return render(
    <Provider store={store}>
      <FilesPage />
    </Provider>,
  );
}

const backendFile = {
  id: 'f1',
  name: '季度报告.pdf',
  type: 'application/pdf',
  size: 2048,
  status: 'ready',
  purpose: 'chat',
  createdAt: '2026-06-06T00:00:00.000Z',
  updatedAt: '2026-06-06T00:00:00.000Z',
  sessionCount: 1,
  messageCount: 2,
};

beforeEach(() => {
  fetchFiles.mockReset();
  deleteFile.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FilesPage', () => {
  it('挂载时加载文件并渲染列表行', async () => {
    fetchFiles.mockResolvedValue({ files: [backendFile], cursor: null });
    renderPage();

    expect(await screen.findByText('季度报告.pdf')).toBeInTheDocument();
    expect(screen.getByText('已就绪')).toBeInTheDocument();
    expect(fetchFiles).toHaveBeenCalledTimes(1);
  });

  it('空数据时不崩溃，仍展示标题', async () => {
    fetchFiles.mockResolvedValue({ files: [], cursor: null });
    renderPage();

    expect(await screen.findByText('文件管理')).toBeInTheDocument();
    expect(screen.queryByText('季度报告.pdf')).not.toBeInTheDocument();
  });

  it('点击刷新会再次拉取文件', async () => {
    fetchFiles.mockResolvedValue({ files: [], cursor: null });
    renderPage();
    await screen.findByText('文件管理');

    await userEvent.click(screen.getByRole('button', { name: /刷新/ }));
    await waitFor(() => expect(fetchFiles.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('加载失败不会抛出，列表为空', async () => {
    fetchFiles.mockRejectedValue(new Error('加载文件失败'));
    renderPage();

    expect(await screen.findByText('文件管理')).toBeInTheDocument();
    expect(screen.queryByText('季度报告.pdf')).not.toBeInTheDocument();
  });
});
