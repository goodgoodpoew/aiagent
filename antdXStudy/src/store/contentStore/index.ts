import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ChatDraft, ChatAttachment } from '../types';

const initialState: ChatDraft = {
  input: '',
  stream: true,
  attachments: [],
};

const contentSlice = createSlice({
  name: 'content',
  initialState,
  reducers: {
    setInput(state, action: PayloadAction<string>) {
      state.input = action.payload;
    },
    clearInput(state) {
      state.input = '';
    },
    updateDraft(state, action: PayloadAction<Partial<Omit<ChatDraft, 'input'>>>) {
      Object.assign(state, action.payload);
    },
    resetDraft() {
      return initialState;
    },
    addAttachment(state, action: PayloadAction<ChatAttachment>) {
      state.attachments.push(action.payload);
    },
    updateAttachment(
      state,
      action: PayloadAction<{ id: string; changes: Partial<ChatAttachment> }>,
    ) {
      const index = state.attachments.findIndex((a) => a.id === action.payload.id);
      if (index !== -1) {
        Object.assign(state.attachments[index], action.payload.changes);
      }
    },
    removeAttachment(state, action: PayloadAction<string>) {
      state.attachments = state.attachments.filter((a) => a.id !== action.payload);
    },
    clearAttachments(state) {
      state.attachments = [];
    },
  },
});

export const {
  setInput,
  clearInput,
  updateDraft,
  resetDraft,
  addAttachment,
  updateAttachment,
  removeAttachment,
  clearAttachments,
} = contentSlice.actions;
export const contentReducer = contentSlice.reducer;
