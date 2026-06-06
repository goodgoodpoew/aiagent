import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

// 使用普通函数实现，避免全局 afterEach 的 vi.restoreAllMocks() 把实现清空，
// 导致 antd 响应式 Hook 调用 matchMedia() 拿到 undefined。
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
});

if (!window.scrollTo) {
  window.scrollTo = vi.fn();
}

// jsdom 对带伪元素参数的 getComputedStyle 抛 not-implemented 警告，rc-table 量算滚动条会触发，
// 这里包一层忽略第二个伪元素参数，避免污染测试输出。
const originalGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((element: Element) => originalGetComputedStyle(element)) as typeof window.getComputedStyle;
