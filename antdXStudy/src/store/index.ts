import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import { contentReducer } from './contentStore';
import { fileReducer } from './fileStore';
import { messageReducer } from './messageStore';
import { sessionReducer } from './sessionStore';

export const store = configureStore({
  reducer: {
    sessions: sessionReducer,
    messages: messageReducer,
    content: contentReducer,
    files: fileReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
