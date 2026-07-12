declare module 'eventsource' {
  import { EventEmitter } from 'node:events';

  export interface EventSourceInitDict {
    headers?: Record<string, string>;
    withCredentials?: boolean;
    proxy?: string;
    https?: unknown;
    rejectUnauthorized?: boolean;
  }

  export default class EventSource extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSED: 2;
    readonly readyState: 0 | 1 | 2;
    onopen: ((event: MessageEvent) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: MessageEvent) => void) | null;
    constructor(url: string, eventSourceInitDict?: EventSourceInitDict);
    close(): void;
  }
}
