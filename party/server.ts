import type * as Party from 'partykit/server';

type FlowMessage =
  | { type: 'init'; nodes: unknown; edges: unknown }
  | { type: 'select'; ids: string[]; from: string }
  | {
      type: 'marquee';
      rect: { x: number; y: number; w: number; h: number } | null;
      from: string;
    }
  | { type: 'add-node'; node: unknown }
  | { type: 'update-node'; node: unknown }
  | { type: 'add-edge'; edge: unknown }
  | { type: 'reset' }
  | { type: 'graph'; nodes: unknown[]; edges: unknown[] }
  | {
      type: 'cursor';
      x: number;
      y: number;
      color?: string;
      name?: string;
      avatar?: string;
    }
  | { type: 'cursor-leave'; id: string };

type ChatMessage = {
  id: string;
  userId: string;
  text?: string;
  image?: string;
  ts: number;
  name?: string;
  color?: string;
  avatar?: string;
};

export default class Server implements Party.Server {
  count = 0;
  flowState: { nodes: unknown[]; edges: unknown[] } = { nodes: [], edges: [] };
  chatHistory: ChatMessage[] = [];
  clients: Set<string> = new Set();
  identities: Map<string, { userId: string; name: string; color: string }> =
    new Map();
  presence: Map<
    string,
    {
      userId: string;
      name: string;
      color: string;
      avatar?: string;
      page: string;
    }
  > = new Map();
  // Editor state per room instance
  editorContent: string = '';
  editorVersion: number = 0;
  // Polls state per room instance
  polls: Array<{
    id: string;
    question: string;
    options: string[];
    votes: Record<number, number>;
  }> = [];

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    console.log(
      `Connected:\n  id: ${conn.id}\n  room: ${this.room.id}\n  url: ${
        new URL(ctx.request.url).pathname
      }`,
    );

    // track connections per room instance
    this.clients.add(conn.id);

    // Room-based init
    if (this.room.id === 'example-room') {
      conn.send(this.count.toString());
    } else if (
      this.room.id === 'reactflow' ||
      this.room.id.startsWith('reactflow-')
    ) {
      const msg: FlowMessage = {
        type: 'init',
        nodes: this.flowState.nodes,
        edges: this.flowState.edges,
      };
      conn.send(JSON.stringify(msg));
    } else if (this.room.id === 'chat' || this.room.id.startsWith('chat-')) {
      conn.send(JSON.stringify({ type: 'init', payload: this.chatHistory }));
      // send presence to the new client and broadcast to others
      const presence = JSON.stringify({
        type: 'presence',
        count: this.clients.size,
      });
      conn.send(presence);
      this.room.broadcast(presence, [conn.id]);
    } else if (
      this.room.id === 'editor' ||
      this.room.id.startsWith('editor-')
    ) {
      conn.send(
        JSON.stringify({
          type: 'init',
          content: this.editorContent,
          version: this.editorVersion,
        }),
      );
    } else if (this.room.id === 'polls' || this.room.id.startsWith('polls-')) {
      conn.send(JSON.stringify({ type: 'init', polls: this.polls }));
    } else if (
      this.room.id === 'presence' ||
      this.room.id.startsWith('presence-')
    ) {
      // initialize with minimal entry; client will immediately identify
      this.presence.set(conn.id, {
        userId: conn.id,
        name: conn.id.slice(0, 4),
        color: '#888',
        page: '#/counter',
      });
      this.broadcastRoster();
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    console.log(`connection ${sender.id} sent message: ${message}`);

    if (this.room.id === 'example-room') {
      if (message === 'increment') this.increment();
      return;
    }

    if (this.room.id === 'reactflow' || this.room.id.startsWith('reactflow-')) {
      try {
        const msg = JSON.parse(message) as FlowMessage | any;
        if (msg?.type === 'identify' && msg?.payload) {
          const { userId, name, color } = msg.payload as {
            userId: string;
            name: string;
            color: string;
          };
          this.identities.set(sender.id, { userId, name, color });
          return;
        }
        if (msg.type === 'add-node' && (msg as any).node) {
          this.flowState.nodes.push((msg as any).node);
          this.room.broadcast(JSON.stringify(msg), [sender.id]);
        } else if (msg.type === 'update-node' && (msg as any).node) {
          const node = (msg as any).node;
          this.flowState.nodes = this.flowState.nodes.map((n: any) =>
            n.id === node.id ? node : n,
          );
          this.room.broadcast(JSON.stringify(msg), [sender.id]);
        } else if (msg.type === 'graph') {
          this.flowState.nodes = Array.isArray((msg as any).nodes)
            ? (msg as any).nodes
            : [];
          this.flowState.edges = Array.isArray((msg as any).edges)
            ? (msg as any).edges
            : [];
          this.room.broadcast(
            JSON.stringify({
              type: 'graph',
              nodes: this.flowState.nodes,
              edges: this.flowState.edges,
            }),
            [sender.id],
          );
        } else if (msg.type === 'add-edge' && (msg as any).edge) {
          this.flowState.edges.push((msg as any).edge);
          this.room.broadcast(JSON.stringify(msg), [sender.id]);
        } else if (msg.type === 'reset') {
          this.flowState = { nodes: [], edges: [] };
          this.room.broadcast(JSON.stringify({ type: 'reset' }));
        } else if (msg.type === 'select') {
          // mirror selection to other clients, enriched with user color/name
          const ident = this.identities.get(sender.id);
          const payload = {
            type: 'select',
            ids: (msg as any).ids || [],
            from: sender.id,
            ...(ident?.color ? { color: ident.color } : {}),
            ...(ident?.name ? { name: ident.name } : {}),
          } as const;
          this.room.broadcast(JSON.stringify(payload), [sender.id]);
        } else if (msg.type === 'marquee') {
          const ident = this.identities.get(sender.id);
          const payload = {
            type: 'marquee',
            rect: (msg as any).rect || null,
            from: sender.id,
            ...(ident?.color ? { color: ident.color } : {}),
            ...(ident?.name ? { name: ident.name } : {}),
          } as const;
          this.room.broadcast(JSON.stringify(payload), [sender.id]);
        } else if (msg.type === 'cursor') {
          const { x, y } = msg as any;
          const ident = this.identities.get(sender.id);
          const color = ident?.color ?? (msg as any).color;
          const name = ident?.name ?? (msg as any).name;
          const avatar = (ident as any)?.avatar ?? (msg as any).avatar;
          const payload = {
            type: 'cursor',
            from: sender.id,
            x,
            y,
            color,
            name,
            avatar,
          } as const;
          this.room.broadcast(JSON.stringify(payload), [sender.id]);
        }
      } catch (e) {
        // ignore
      }
      return;
    }

    if (this.room.id === 'chat' || this.room.id.startsWith('chat-')) {
      try {
        const data = JSON.parse(message) as { type: string; payload?: unknown };
        if (data.type === 'typing') {
          // broadcast typing to others; client will timeout the indicator
          this.room.broadcast(
            JSON.stringify({ type: 'typing', payload: { from: sender.id } }),
            [sender.id],
          );
          return;
        }
        if (data.type === 'identify' && data.payload) {
          const { userId, name, color, avatar } = data.payload as {
            userId: string;
            name: string;
            color: string;
            avatar?: string;
          };
          this.identities.set(sender.id, {
            userId,
            name,
            color,
            ...(avatar ? { avatar } : {}),
          } as any);
          this.room.broadcast(
            JSON.stringify({ type: 'presence', count: this.clients.size }),
            [],
          );
          return;
        }
        if ((data as any).type === 'react' && (data as any).payload) {
          const { id, emoji } = (data as any).payload as {
            id: string;
            emoji: string;
          };
          const m = this.chatHistory.find((mm) => (mm as any).id === id) as any;
          if (m) {
            m.reactions = m.reactions || {};
            m.reactions[emoji] = (m.reactions[emoji] || 0) + 1;
          }
          this.room.broadcast(
            JSON.stringify({ type: 'react', payload: { id, emoji } }),
            [sender.id],
          );
          return;
        }
        if (data.type === 'chat') {
          const incoming = data.payload as ChatMessage;
          const ident = this.identities.get(sender.id);
          const enriched: ChatMessage = {
            ...incoming,
            name: ident?.name ?? (incoming as any).name,
            userId: ident?.userId ?? incoming.userId,
            ...(ident?.color ? { color: ident.color } : {}),
            ...((ident as any)?.avatar
              ? { avatar: (ident as any).avatar }
              : {}),
          };
          this.chatHistory.push(enriched as ChatMessage);
          this.room.broadcast(
            JSON.stringify({ type: 'chat', payload: enriched }),
            [sender.id],
          );
        }
      } catch (e) {
        // ignore
      }
      return;
    }

    if (this.room.id === 'editor' || this.room.id.startsWith('editor-')) {
      try {
        const data = JSON.parse(message) as { type: string; payload?: any };
        if (data.type === 'identify' && data.payload) {
          const { userId, name, color, avatar } = data.payload as {
            userId: string;
            name: string;
            color: string;
            avatar?: string;
          };
          this.identities.set(sender.id, {
            userId,
            name,
            color,
            ...(avatar ? { avatar } : {}),
          } as any);
          return;
        }
        if (data.type === 'edit' && data.payload) {
          const { content, version } = data.payload as {
            content: string;
            version: number;
          };
          this.editorContent =
            typeof content === 'string' ? content : this.editorContent;
          this.editorVersion =
            typeof version === 'number' ? version : this.editorVersion + 1;
          this.room.broadcast(
            JSON.stringify({
              type: 'edit',
              content: this.editorContent,
              version: this.editorVersion,
            }),
            [sender.id],
          );
          return;
        }
        if (data.type === 'cursor' && data.payload) {
          const pos = Number((data.payload as any).pos) || 0;
          const selStart = (data.payload as any).selStart;
          const selEnd = (data.payload as any).selEnd;
          const ident = this.identities.get(sender.id);
          const payload = {
            type: 'cursor',
            from: sender.id,
            pos,
            name: ident?.name ?? (data.payload as any).name,
            color: ident?.color ?? (data.payload as any).color,
            ...(typeof selStart === 'number' ? { selStart } : {}),
            ...(typeof selEnd === 'number' ? { selEnd } : {}),
          } as const;
          this.room.broadcast(JSON.stringify(payload), [sender.id]);
          return;
        }
      } catch {}
      return;
    }

    if (this.room.id === 'polls' || this.room.id.startsWith('polls-')) {
      try {
        const data = JSON.parse(message) as { type: string; payload?: any };
        if (data.type === 'identify' && data.payload) {
          const { userId, name, color, avatar } = data.payload as {
            userId: string;
            name: string;
            color: string;
            avatar?: string;
          };
          this.identities.set(sender.id, {
            userId,
            name,
            color,
            ...(avatar ? { avatar } : {}),
          } as any);
          return;
        }
        if (data.type === 'create-poll' && data.payload) {
          const { question, options } = data.payload as {
            question: string;
            options: string[];
          };
          if (
            typeof question === 'string' &&
            Array.isArray(options) &&
            options.length >= 2
          ) {
            const id = Math.random().toString(36).slice(2, 10);
            const votes: Record<number, number> = {};
            for (let i = 0; i < options.length; i++) votes[i] = 0;
            this.polls.push({ id, question, options, votes });
            this.room.broadcast(
              JSON.stringify({ type: 'polls', polls: this.polls }),
              [],
            );
          }
          return;
        }
        if (data.type === 'vote' && data.payload) {
          const { pollId, option } = data.payload as {
            pollId: string;
            option: number;
          };
          const poll = this.polls.find((p) => p.id === pollId);
          if (
            poll &&
            typeof option === 'number' &&
            option >= 0 &&
            option < poll.options.length
          ) {
            poll.votes[option] = (poll.votes[option] || 0) + 1;
            this.room.broadcast(
              JSON.stringify({ type: 'polls', polls: this.polls }),
              [],
            );
          }
          return;
        }
      } catch {}
      return;
    }

    if (this.room.id === 'presence' || this.room.id.startsWith('presence-')) {
      try {
        const data = JSON.parse(message) as { type: string; payload?: any };
        if (data.type === 'identify') {
          const { userId, name, color, avatar, page } = data.payload as {
            userId: string;
            name: string;
            color: string;
            avatar?: string;
            page: string;
          };
          this.presence.set(sender.id, { userId, name, color, avatar, page });
          this.broadcastRoster();
        } else if (data.type === 'page') {
          const entry = this.presence.get(sender.id);
          if (entry) {
            entry.page = data.payload?.page ?? entry.page;
            this.broadcastRoster();
          }
        }
      } catch {}
      return;
    }
  }

  onClose(conn: Party.Connection) {
    if (this.room.id === 'reactflow' || this.room.id.startsWith('reactflow-')) {
      this.room.broadcast(
        JSON.stringify({
          type: 'cursor-leave',
          id: conn.id,
        } satisfies FlowMessage),
        [conn.id],
      );
    }

    // update presence for chat
    if (this.clients.has(conn.id)) {
      this.clients.delete(conn.id);
      this.identities.delete(conn.id);
      if (this.room.id === 'chat') {
        this.room.broadcast(
          JSON.stringify({ type: 'presence', count: this.clients.size }),
          [],
        );
      }
    }

    if (this.room.id === 'presence' || this.room.id.startsWith('presence-')) {
      this.presence.delete(conn.id);
      this.broadcastRoster();
    }
  }

  onRequest(req: Party.Request) {
    if (this.room.id === 'example-room') {
      if (req.method === 'POST') this.increment();
      return new Response(this.count.toString());
    }
    return new Response('ok');
  }

  increment() {
    this.count = (this.count + 1) % 100;
    this.room.broadcast(this.count.toString(), []);
  }

  private broadcastRoster() {
    if (!(this.room.id === 'presence' || this.room.id.startsWith('presence-')))
      return;
    const roster = Array.from(this.presence.values());
    this.room.broadcast(
      JSON.stringify({ type: 'roster', payload: roster }),
      [],
    );
  }
}

Server satisfies Party.Worker;
