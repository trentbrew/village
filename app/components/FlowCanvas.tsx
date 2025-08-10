import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PartySocket from 'partysocket';
import usePartySocket from 'partysocket/react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import type { Connection, Edge, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { getIdentity } from '../identity';

type FlowMessage =
  | { type: 'init'; nodes: Node[]; edges: Edge[] }
  | { type: 'add-node'; node: Node }
  | { type: 'update-node'; node: Node }
  | { type: 'add-edge'; edge: Edge }
  | { type: 'reset' }
  | {
      type: 'cursor';
      from?: string;
      x: number;
      y: number;
      color?: string;
      name?: string;
    }
  | { type: 'cursor-leave'; id: string };

export default function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([
    { id: '1', position: { x: 50, y: 50 }, data: { label: 'A' } },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const socket = usePartySocket({
    room: 'reactflow',
    onMessage(evt) {
      try {
        const msg: FlowMessage = JSON.parse(evt.data);
        if (msg.type === 'init') {
          setNodes(msg.nodes);
          setEdges(msg.edges);
        } else if (msg.type === 'add-node') {
          setNodes((ns) => [...ns, msg.node]);
        } else if (msg.type === 'update-node') {
          setNodes((ns) =>
            ns.map((n) => (n.id === msg.node.id ? msg.node : n)),
          );
        } else if (msg.type === 'add-edge') {
          setEdges((es) => [...es, msg.edge]);
        } else if (msg.type === 'reset') {
          setNodes([]);
          setEdges([]);
        } else if (msg.type === 'cursor' && msg.from) {
          setRemoteCursors((prev) => ({
            ...prev,
            [msg.from!]: {
              x: msg.x,
              y: msg.y,
              color: msg.color ?? '#1677ff',
              name: msg.name ?? msg.from!,
            },
          }));
        } else if (msg.type === 'cursor-leave') {
          setRemoteCursors((prev) => {
            const { [msg.id]: _gone, ...rest } = prev;
            return rest;
          });
        }
      } catch (e) {
        // ignore
      }
    },
  });

  const onConnect = useCallback((connection: Connection) => {
    const newEdge: Edge = {
      ...connection,
      id: `${connection.source}-${connection.target}`,
    } as Edge;
    setEdges((es) => addEdge(newEdge, es));
    socket.send(
      JSON.stringify({ type: 'add-edge', edge: newEdge } satisfies FlowMessage),
    );
  }, []);

  const onNodeDrag = useCallback((_: unknown, node: Node) => {
    setNodes((ns) => ns.map((n) => (n.id === node.id ? node : n)));
    socket.send(
      JSON.stringify({ type: 'update-node', node } satisfies FlowMessage),
    );
  }, []);
  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    setNodes((ns) => ns.map((n) => (n.id === node.id ? node : n)));
    socket.send(
      JSON.stringify({ type: 'update-node', node } satisfies FlowMessage),
    );
  }, []);

  const addNode = () => {
    const id = Math.random().toString(36).slice(2, 8);
    const node: Node = {
      id,
      position: { x: Math.random() * 400, y: Math.random() * 200 },
      data: { label: `Node ${id}` },
    };
    setNodes((ns) => [...ns, node]);
    socket.send(
      JSON.stringify({ type: 'add-node', node } satisfies FlowMessage),
    );
  };

  // Cursor broadcasting
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<any>(null);
  const [remoteCursors, setRemoteCursors] = useState<
    Record<string, { x: number; y: number; color: string; name: string }>
  >({});
  const base = getIdentity();
  const myColor = base.color;
  const myName = base.name || base.userId;
  const myAvatar = base.avatar;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // project from screen to flow coordinates to account for pan/zoom
      const rf = flowRef.current as any;
      const { x, y } =
        rf && rf.project ? rf.project({ x: px, y: py }) : { x: px, y: py };
      socket.send(
        JSON.stringify({
          type: 'cursor',
          x,
          y,
          color: myColor,
          name: myName,
        } satisfies FlowMessage),
      );
    };
    el.addEventListener('mousemove', onMove);
    return () => el.removeEventListener('mousemove', onMove);
  }, [socket, myColor, myName]);

  // Identify on open so server can enrich cursor messages
  useEffect(() => {
    (socket as any).onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'identify',
          payload: {
            userId: base.userId,
            name: myName,
            color: myColor,
            avatar: myAvatar,
          },
        }),
      );
    };
  }, [socket, myColor, myName, myAvatar]);

  return (
    <div ref={wrapperRef} style={{ height: 500, position: 'relative' }}>
      <div style={{ marginBottom: 8 }}>
        <button onClick={addNode}>Add node</button>
      </div>
      <ReactFlow
        ref={flowRef}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>
      {Object.entries(remoteCursors).map(([id, c]) => (
        <div
          key={id}
          style={{
            position: 'absolute',
            left: c.x,
            top: c.y,
            pointerEvents: 'none',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: c.color,
              boxShadow: '0 0 0 2px #fff',
            }}
          />
          <div
            style={{
              marginTop: 2,
              background: '#000',
              color: '#fff',
              padding: '2px 6px',
              borderRadius: 6,
              fontSize: 10,
              whiteSpace: 'nowrap',
            }}
          >
            {c.name}
          </div>
        </div>
      ))}
    </div>
  );
}
