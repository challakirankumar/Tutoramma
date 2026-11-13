/**
 * MiniIO — a minimal socket.io-style server for Cloudflare Durable Objects.
 *
 * It gives the realtime hubs the same programming model they had as
 * socket.io mini-services (`io.on("connection")`, `socket.on/emit/join`,
 * `io.to(room).emit`, per-socket rooms keyed by socket id) while running on
 * native WebSockets inside a Durable Object. Wire format: `{ e, d }` JSON.
 */

type Handler = (data: any) => void | Promise<void>;

export class MiniSocket {
  readonly id: string;
  readonly rooms = new Set<string>();
  private handlers = new Map<string, Handler[]>();
  private open = true;

  constructor(private server: MiniIO, private ws: WebSocket) {
    this.id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    this.rooms.add(this.id);
  }

  on(event: string, handler: Handler) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, data?: unknown) {
    if (!this.open) return this;
    try {
      this.ws.send(JSON.stringify({ e: event, d: data }));
    } catch {
      /* socket already gone; cleanup happens on close */
    }
    return this;
  }

  join(room: string) {
    this.rooms.add(room);
    this.server.addToRoom(room, this);
    return this;
  }

  leave(room: string) {
    this.rooms.delete(room);
    this.server.removeFromRoom(room, this);
    return this;
  }

  disconnect(_close?: boolean) {
    try {
      this.ws.close(1000, "server disconnect");
    } catch {}
    this.server.handleClose(this);
    return this;
  }

  /** @internal */
  async dispatch(event: string, data: unknown) {
    const list = this.handlers.get(event);
    if (!list) return;
    for (const h of list) {
      try {
        await h(data);
      } catch (e) {
        console.error(`[mini-io] handler "${event}" failed:`, (e as Error).message);
      }
    }
  }

  /** @internal */
  markClosed() {
    if (!this.open) return false;
    this.open = false;
    return true;
  }
}

export class MiniIO {
  private connectionHandlers: ((s: MiniSocket) => void)[] = [];
  private roomMembers = new Map<string, Set<MiniSocket>>();
  readonly sockets = { sockets: new Map<string, MiniSocket>() };

  on(event: "connection", handler: (s: MiniSocket) => void) {
    if (event === "connection") this.connectionHandlers.push(handler);
    return this;
  }

  to(room: string) {
    return {
      emit: (event: string, data?: unknown) => {
        const direct = this.sockets.sockets.get(room);
        if (direct) {
          direct.emit(event, data);
          return;
        }
        const members = this.roomMembers.get(room);
        if (!members) return;
        for (const s of members) s.emit(event, data);
      },
    };
  }

  get connectionCount() {
    return this.sockets.sockets.size;
  }

  addToRoom(room: string, s: MiniSocket) {
    if (room === s.id) return;
    if (!this.roomMembers.has(room)) this.roomMembers.set(room, new Set());
    this.roomMembers.get(room)!.add(s);
  }

  removeFromRoom(room: string, s: MiniSocket) {
    const set = this.roomMembers.get(room);
    if (!set) return;
    set.delete(s);
    if (set.size === 0) this.roomMembers.delete(room);
  }

  handleClose(s: MiniSocket) {
    if (!s.markClosed()) return;
    this.sockets.sockets.delete(s.id);
    for (const r of s.rooms) this.removeFromRoom(r, s);
    void s.dispatch("disconnect", "transport close");
  }

  /** Accept a WebSocket upgrade and wire it into the event model. */
  upgrade(request: Request): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const socket = new MiniSocket(this, server);
    this.sockets.sockets.set(socket.id, socket);
    for (const h of this.connectionHandlers) h(socket);

    server.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string" || ev.data.length > 512_000) return;
      let msg: { e?: string; d?: unknown };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!msg.e) return;
      if (msg.e === "__ping") {
        socket.emit("__pong");
        return;
      }
      void socket.dispatch(msg.e, msg.d);
    });
    server.addEventListener("close", () => this.handleClose(socket));
    server.addEventListener("error", () => this.handleClose(socket));

    socket.emit("__id", socket.id);
    return new Response(null, { status: 101, webSocket: client });
  }
}
