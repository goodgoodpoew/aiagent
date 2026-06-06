import { http, HttpResponse } from 'msw';

const API_BASE_URL = 'http://localhost:3001/api';

export const handlers = [
  http.get(`${API_BASE_URL}/sessions`, () =>
    HttpResponse.json({
      sessions: [],
      cursor: null,
    }),
  ),
  http.get(`${API_BASE_URL}/sessions/:sessionId/messages`, () =>
    HttpResponse.json({
      messages: [],
      cursor: null,
    }),
  ),
  http.get(`${API_BASE_URL}/sessions/:sessionId/files`, () =>
    HttpResponse.json({
      files: [],
    }),
  ),
  http.get(`${API_BASE_URL}/model-providers`, () => HttpResponse.json([])),
];
