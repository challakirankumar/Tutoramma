"use client";

/**
 * Tutor Amma realtime client.
 *
 * A tiny, dependency-free stand-in for `socket.io-client` that speaks a JSON
 * event protocol over a native WebSocket to our Cloudflare Durable Objects
 * (see `src/realtime/mini-io.ts`). It keeps the socket.io surface the app
 * relies on: `on / off / once / emit / disconnect / id / connected`, the
 * `connect` / `disconnect` lifecycle events, emit buffering while offline and
 * automatic reconnection with back-off.
 */

type Handler = (...args: any[]) => void;

export interface RealtimeOptions {
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  /** accepted for socket.io compatibility, ignored */
  [k: string]: unknown;
}

export class RealtimeSocket {
  id: string | undefined;
  connected = false;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private queue: string[] = [];
  private attempts = 0;
  private closedByUser = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(private url: string, private opts: RealtimeOptions = {}) {
    this.open();
  }

  private resolveUrl(): string {
    const u = new URL(this.url, window.location.href);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
  }

  private open() {
    if (typeof window === "undefined") return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.resolveUrl());
    } catch (e) {
      this.fire("connect_error", e);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onmessage = (ev) => {
      let msg: { e: string; d?: unknown };
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      if (msg.e === "__id") {
        this.id = String(msg.d);
        this.connected = true;
        this.attempts = 0;
        const pending = this.queue.splice(0);
        for (const frame of pending) ws.send(frame);
        this.startHeartbeat();
        this.fire("connect");
        return;
      }
      if (msg.e === "__pong") return;
      this.fire(msg.e, msg.d);
    };
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      this.stopHeartbeat();
      if (was) this.fire("disconnect", this.closedByUser ? "io client disconnect" : "transport close");
      else if (!this.closedByUser) this.fire("connect_error", new Error("Realtime service unreachable"));
      if (!this.closedByUser) this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows and drives reconnection */
    };
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ e: "__ping" }));
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private scheduleReconnect() {
    if (this.opts.reconnection === false) return;
    const max = this.opts.reconnectionAttempts ?? Infinity;
    if (this.attempts >= max) return;
    this.attempts++;
    const base = this.opts.reconnectionDelay ?? 1000;
    const delay = Math.min(10000, base * Math.pow(1.5, this.attempts - 1)) + Math.random() * 400;
    this.timer = setTimeout(() => this.open(), delay);
  }

  private fire(event: string, ...args: unknown[]) {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(...args);
      } catch (e) {
        console.error(`[realtime] handler for "${event}" failed`, e);
      }
    }
  }

  on(event: string, handler: Handler): this {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }

  once(event: string, handler: Handler): this {
    const wrap: Handler = (...a) => {
      this.off(event, wrap);
      handler(...a);
    };
    return this.on(event, wrap);
  }

  off(event?: string, handler?: Handler): this {
    if (!event) this.handlers.clear();
    else if (!handler) this.handlers.delete(event);
    else this.handlers.get(event)?.delete(handler);
    return this;
  }

  removeAllListeners(event?: string): this {
    return this.off(event);
  }

  emit(event: string, data?: unknown): this {
    const frame = JSON.stringify({ e: event, d: data });
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame);
    else if (this.queue.length < 200) this.queue.push(frame);
    return this;
  }

  connect(): this {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return this;
    this.closedByUser = false;
    this.attempts = 0;
    this.open();
    return this;
  }

  disconnect(): this {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.stopHeartbeat();
    this.queue = [];
    try {
      this.ws?.close(1000, "client disconnect");
    } catch {}
    return this;
  }

  close(): this {
    return this.disconnect();
  }
}

export type Socket = RealtimeSocket;

export function io(url: string, opts?: RealtimeOptions): RealtimeSocket {
  return new RealtimeSocket(url, opts);
}
