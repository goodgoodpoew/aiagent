import { Module } from '@nestjs/common';
import type { Response } from 'express';
import {
  createStreamEventWriter,
  type StreamEventWriter,
  type StreamEventWriterBase,
} from './protocol/stream-event-writer';

export const STREAM_EVENT_WRITER_FACTORY = 'STREAM_EVENT_WRITER_FACTORY';

export type StreamEventWriterFactory = (
  res: Response,
  base: Omit<StreamEventWriterBase, 'protocol'> & Partial<Pick<StreamEventWriterBase, 'protocol'>>,
) => StreamEventWriter;

@Module({
  providers: [
    {
      provide: STREAM_EVENT_WRITER_FACTORY,
      useValue: createStreamEventWriter,
    },
  ],
  exports: [STREAM_EVENT_WRITER_FACTORY],
})
export class StreamingModule {}
