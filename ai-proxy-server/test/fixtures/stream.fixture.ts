export const openAiTextDeltaChunk = (content: string) =>
  JSON.stringify({
    choices: [{ delta: { content } }],
  });

export const openAiFinishChunk = JSON.stringify({
  choices: [{ delta: {}, finish_reason: 'stop' }],
});

export const openAiDoneChunk = '[DONE]';
