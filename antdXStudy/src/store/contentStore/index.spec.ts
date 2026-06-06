import { describe, expect, it } from 'vitest';
import {
  addAttachment,
  clearAttachments,
  clearInput,
  contentReducer,
  removeAttachment,
  resetDraft,
  setInput,
  updateAttachment,
  updateDraft,
} from './index';
import type { ChatAttachment } from '../types';

type ContentState = ReturnType<typeof contentReducer>;

function initialState(): ContentState {
  return contentReducer(undefined, { type: '@@INIT' });
}

function attachment(overrides: Partial<ChatAttachment> & Pick<ChatAttachment, 'id'>): ChatAttachment {
  return {
    name: '附件.txt',
    type: 'text/plain',
    size: 10,
    status: 'uploading',
    ...overrides,
  };
}

describe('contentReducer', () => {
  it('setInput / clearInput 维护输入框', () => {
    let state = contentReducer(initialState(), setInput('你好'));
    expect(state.input).toBe('你好');
    state = contentReducer(state, clearInput());
    expect(state.input).toBe('');
  });

  it('updateDraft 局部更新 runtime 选项', () => {
    const state = contentReducer(
      initialState(),
      updateDraft({ provider: 'openai', model: 'gpt-4o', reasoning: { enabled: false, effort: 'high', display: 'full' } }),
    );
    expect(state.provider).toBe('openai');
    expect(state.model).toBe('gpt-4o');
    expect(state.reasoning).toEqual({ enabled: false, effort: 'high', display: 'full' });
  });

  it('附件增改删清完整链路', () => {
    let state = contentReducer(initialState(), addAttachment(attachment({ id: 'temp-1' })));
    expect(state.attachments).toHaveLength(1);

    state = contentReducer(
      state,
      updateAttachment({ id: 'temp-1', changes: { id: 'real-1', status: 'ready' } }),
    );
    expect(state.attachments[0]).toMatchObject({ id: 'real-1', status: 'ready' });

    state = contentReducer(state, addAttachment(attachment({ id: 'real-2' })));
    state = contentReducer(state, removeAttachment('real-1'));
    expect(state.attachments.map((item) => item.id)).toEqual(['real-2']);

    state = contentReducer(state, clearAttachments());
    expect(state.attachments).toEqual([]);
  });

  it('updateAttachment 对不存在的 id 不报错', () => {
    const state = contentReducer(initialState(), updateAttachment({ id: 'missing', changes: { status: 'ready' } }));
    expect(state.attachments).toEqual([]);
  });

  it('resetDraft 回到初始草稿', () => {
    let state = contentReducer(initialState(), setInput('草稿'));
    state = contentReducer(state, addAttachment(attachment({ id: 'temp-1' })));
    state = contentReducer(state, resetDraft());
    expect(state.input).toBe('');
    expect(state.attachments).toEqual([]);
    expect(state.stream).toBe(true);
  });
});
