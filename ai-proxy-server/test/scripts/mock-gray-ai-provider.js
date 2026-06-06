const http = require('http');

const port = Number(process.env.GRAY_AI_MOCK_PORT || 3101);

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function extractPrompt(payload) {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const last = messages[messages.length - 1];
  const content = last && typeof last.content === 'string' ? last.content : '';
  return content.slice(0, 80);
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function writeStream(res, prompt) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const chunks = ['灰度 mock 回答：', prompt || '已收到请求'];
  chunks.forEach((content) => {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  });
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    writeJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    writeJson(res, 404, { error: { message: 'not found' } });
    return;
  }

  try {
    const payload = await readJson(req);
    const prompt = extractPrompt(payload);
    if (prompt.includes('灰度触发上游错误') || prompt.includes('gray-upstream-error')) {
      writeJson(res, 500, { error: { message: 'gray mock upstream error' } });
      return;
    }

    if (payload.stream) {
      writeStream(res, prompt);
      return;
    }

    writeJson(res, 200, {
      choices: [{ message: { role: 'assistant', content: `灰度 mock 回答：${prompt}` } }],
    });
  } catch (error) {
    writeJson(res, 400, {
      error: { message: error instanceof Error ? error.message : String(error) },
    });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`灰度 mock AI provider 已启动: http://127.0.0.1:${port}/v1`);
});
