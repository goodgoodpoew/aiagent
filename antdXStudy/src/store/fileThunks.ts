import { normalizeFileList } from './adapters/fileAdapter';
import {
  loadFilesFailure,
  loadFilesStart,
  loadFilesSuccess,
  loadSessionFilesFailure,
  loadSessionFilesStart,
  loadSessionFilesSuccess,
  removeFileFromState,
} from './fileStore';
import type { AppDispatch, RootState } from './index';
import {
  deleteFile as deleteFileRequest,
  fetchFiles,
  fetchSessionFiles,
  type FetchFilesParams,
} from '@/service/file';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const loadFiles =
  (params?: FetchFilesParams & { append?: boolean }) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(loadFilesStart({ status: params?.status, append: params?.append }));
    try {
      const cursor = params?.append ? getState().files.globalCursor : undefined;
      const response = await fetchFiles({ ...params, cursor });
      dispatch(loadFilesSuccess({ ...normalizeFileList(response), append: params?.append }));
    } catch (error) {
      dispatch(loadFilesFailure(getErrorMessage(error, '加载文件失败')));
    }
  };

export const loadSessionFiles =
  (sessionId: string, params?: { append?: boolean }) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(loadSessionFilesStart(sessionId));
    try {
      const cursor = params?.append ? getState().files.cursorBySessionId[sessionId] : undefined;
      const response = await fetchSessionFiles(sessionId, { cursor });
      dispatch(
        loadSessionFilesSuccess({
          sessionId,
          ...normalizeFileList(response),
          append: params?.append,
        }),
      );
    } catch (error) {
      dispatch(
        loadSessionFilesFailure({
          sessionId,
          error: getErrorMessage(error, '加载会话文件失败'),
        }),
      );
    }
  };

export const deleteManagedFile =
  (fileId: string) => async (dispatch: AppDispatch) => {
    await deleteFileRequest(fileId);
    dispatch(removeFileFromState(fileId));
  };
