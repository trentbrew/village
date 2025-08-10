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
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  useEdgesState,
  useNodesState,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  useViewport,
} from 'reactflow';
import BasicNode from './nodes/BasicNode';
import type { Connection, Edge, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { getIdentity } from '../identity';
import { featureRoom, getRoomId } from '../rooms';

type FlowMessage =
  | { type: 'init'; nodes: Node[]; edges: Edge[] }
  | { type: 'select'; ids: string[]; from: string }
  | {
      type: 'marquee';
      rect: { x: number; y: number; w: number; h: number } | null;
      from: string;
    }
  | { type: 'add-node'; node: Node }
  | { type: 'update-node'; node: Node }
  | { type: 'add-edge'; edge: Edge }
  | { type: 'reset' }
  | { type: 'graph'; nodes: Node[]; edges: Edge[] }
  | {
      type: 'cursor';
      from?: string;
      x: number;
      y: number;
      color?: string;
      name?: string;
    }
  | { type: 'cursor-leave'; id: string };

function FlowCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState([
    {
      id: '1',
      position: { x: 50, y: 50 },
      data: { label: 'A' },
      type: 'basic',
      style: { width: 160, height: 80 },
    },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const panOnDrag = [1, 2];

  // Marquee selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const additiveRef = useRef<boolean>(false);

  // Context menu state
  const [menu, setMenu] = useState<null | {
    x: number; // wrapper-relative px
    y: number; // wrapper-relative px
    fx: number; // flow coords
    fy: number; // flow coords
  }>(null);

  const socket = usePartySocket({
    room: featureRoom('reactflow'),
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
        } else if (msg.type === 'graph') {
          setNodes(msg.nodes);
          setEdges(msg.edges);
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
        } else if (msg.type === 'select' && (msg as any).from) {
          const from = (msg as any).from as string;
          setRemoteSelections((prev) => ({
            ...prev,
            [from]: {
              ids: (msg as any).ids || [],
              color: (msg as any).color,
              name: (msg as any).name,
            },
          }));
        } else if (msg.type === 'marquee' && (msg as any).from) {
          const from = (msg as any).from as string;
          const rect = (msg as any).rect || null;
          setRemoteMarquees((prev) => {
            const next: any = { ...prev };
            if (!rect) delete next[from];
            else
              next[from] = {
                rect,
                color: (msg as any).color,
                name: (msg as any).name,
              };
            return next;
          });
        } else if (msg.type === 'cursor-leave') {
          setRemoteCursors((prev) => {
            // handle synthetic self-id by clearing all known cursors for this client id
            const key = (msg as any).id;
            if (key === 'self') return prev;
            const { [key]: _gone, ...rest } = prev;
            setRemoteSelections((s) => {
              const { [key]: _sGone, ...sRest } = s as any;
              return sRest as any;
            });
            setRemoteMarquees((m) => {
              const { [key]: _mGone, ...mRest } = m as any;
              return mRest as any;
            });
            return rest;
          });
        }
      } catch (e) {
        // ignore
      }
    },
  });

  // ensure cursor is removed on unmount/refresh by sending a synthetic leave
  useEffect(() => {
    return () => {
      // hint peers to drop our cursor
      try {
        socket.send(
          JSON.stringify({ type: 'cursor-leave', id: 'self' } as any),
        );
      } catch {}
    };
  }, [socket]);

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
      style: { width: 160, height: 80 },
      // React Flow v11: resizable via NodeResizer component in custom node or default supports style size
    };
    setNodes((ns) => [...ns, node]);
    socket.send(
      JSON.stringify({ type: 'add-node', node } satisfies FlowMessage),
    );
  };

  const addNodeAt = (x: number, y: number) => {
    const id = Math.random().toString(36).slice(2, 8);
    const node: Node = {
      id,
      position: { x, y },
      data: { label: `Node ${id}` },
      style: { width: 160, height: 80 },
    };
    setNodes((ns) => [...ns, node]);
    socket.send(
      JSON.stringify({ type: 'add-node', node } satisfies FlowMessage),
    );
  };

  // Robust sync: broadcast full graph on editor changes
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof applyNodeChanges>[0]) => {
      setNodes((curr) => {
        const next = applyNodeChanges(changes, curr);
        socket.send(
          JSON.stringify({
            type: 'graph',
            nodes: next,
            edges,
          } satisfies FlowMessage),
        );
        return next;
      });
    },
    [edges, socket],
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof applyEdgeChanges>[0]) => {
      setEdges((curr) => {
        const next = applyEdgeChanges(changes, curr);
        socket.send(
          JSON.stringify({
            type: 'graph',
            nodes,
            edges: next,
          } satisfies FlowMessage),
        );
        return next;
      });
    },
    [nodes, socket],
  );

  // Cursor broadcasting
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<any>(null);
  const [remoteCursors, setRemoteCursors] = useState<
    Record<string, { x: number; y: number; color: string; name: string }>
  >({});
  const [remoteSelections, setRemoteSelections] = useState<
    Record<string, { ids: string[]; color?: string; name?: string }>
  >({});
  const [remoteMarquees, setRemoteMarquees] = useState<
    Record<
      string,
      {
        rect: { x: number; y: number; w: number; h: number };
        color?: string;
        name?: string;
      }
    >
  >({});
  const base = getIdentity();
  const myColor = base.color;
  const myName = base.name || base.userId;
  const myAvatar = base.avatar;

  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
  useViewport(); // subscribe to pan/zoom to re-render overlay

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let raf = 0 as number | 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        socket.send(
          JSON.stringify({
            type: 'cursor',
            x: p.x,
            y: p.y,
            color: myColor,
            name: myName,
          } satisfies FlowMessage),
        );
      });
    };
    el.addEventListener('pointermove', onMove as any, { passive: true } as any);
    return () => {
      el.removeEventListener('pointermove', onMove as any);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [screenToFlowPosition, socket, myColor, myName]);

  // (viewport subscription handled via useViewport())

  // Context menu: right-click to add node at position
  useEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('.react-flow__node') ||
        target.closest('.react-flow__handle')
      )
        return;
      e.preventDefault();
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const rect = wrap.getBoundingClientRect();
      setMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        fx: p.x,
        fy: p.y,
      });
    };

    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    const onGlobalPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.pk-flow-menu')) return;
      setMenu(null);
    };

    wrap.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onGlobalPointerDown, true);

    return () => {
      wrap.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true as any);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(
        'pointerdown',
        onGlobalPointerDown,
        true as any,
      );
    };
  }, []);

  // Marquee selection handlers
  useEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;

    const getScreen = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });

    const onPointerDown = (e: PointerEvent) => {
      // only left button, and only when starting on the pane (not a node/handle)
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (
        target.closest('.react-flow__node') ||
        target.closest('.react-flow__handle')
      )
        return;
      // ignore clicks on context menu and close it instead
      if (target.closest('.pk-flow-menu')) {
        return;
      }
      if (menu) setMenu(null);

      additiveRef.current = e.shiftKey || e.metaKey || e.ctrlKey;
      const startScreen = getScreen(e);
      const startFlow = screenToFlowPosition(startScreen);
      selectionStartRef.current = { x: startFlow.x, y: startFlow.y } as any;
      setIsSelecting(true);
      const rect = wrap.getBoundingClientRect();
      setSelectionRect({
        x: startScreen.x - rect.left,
        y: startScreen.y - rect.top,
        w: 0,
        h: 0,
      });
      try {
        (wrap as any).setPointerCapture?.(e.pointerId);
      } catch {}
      e.preventDefault();
      e.stopPropagation();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!selectionStartRef.current) return;
      const currScreen = getScreen(e);
      const currFlow = screenToFlowPosition(currScreen);
      const start = selectionStartRef.current as any; // flow coords
      const x1f = Math.min(start.x, currFlow.x);
      const y1f = Math.min(start.y, currFlow.y);
      const x2f = Math.max(start.x, currFlow.x);
      const y2f = Math.max(start.y, currFlow.y);
      const wrapRect = wrap.getBoundingClientRect();
      const tl = flowToScreenPosition({ x: x1f, y: y1f });
      const br = flowToScreenPosition({ x: x2f, y: y2f });
      setSelectionRect({
        x: tl.x - wrapRect.left,
        y: tl.y - wrapRect.top,
        w: br.x - tl.x,
        h: br.y - tl.y,
      });
      e.preventDefault();
      e.stopPropagation();
    };

    const onPointerUp = (_e: PointerEvent) => {
      if (!selectionStartRef.current || !selectionRect) return cleanup();
      // compute selection via DOM rects for nodes
      const rect = selectionRect;
      const nodeEls = Array.from(
        wrap.querySelectorAll<HTMLElement>('.react-flow__node'),
      );
      const wrapRect = wrap.getBoundingClientRect();
      const selectedIds = new Set<string>();
      for (const el of nodeEls) {
        const r = el.getBoundingClientRect();
        const local = {
          left: r.left - wrapRect.left,
          top: r.top - wrapRect.top,
          right: r.right - wrapRect.left,
          bottom: r.bottom - wrapRect.top,
        };
        const inter = !(
          local.right < rect.x ||
          local.left > rect.x + rect.w ||
          local.bottom < rect.y ||
          local.top > rect.y + rect.h
        );
        if (inter) {
          // dataset id is on node element
          const id = (el.getAttribute('data-id') || '') as string;
          if (id) selectedIds.add(id);
        }
      }

      setNodes((curr) => {
        return curr.map((n) => {
          const hit = selectedIds.has(n.id);
          if (additiveRef.current) {
            return { ...n, selected: hit ? true : n.selected } as any;
          }
          return { ...n, selected: hit } as any;
        });
      });

      // broadcast selection ids and clear remote marquee
      try {
        socket.send(
          JSON.stringify({
            type: 'select',
            ids: Array.from(selectedIds),
          } as any),
        );
        socket.send(JSON.stringify({ type: 'marquee', rect: null } as any));
      } catch {}

      cleanup();
    };

    const cleanup = () => {
      selectionStartRef.current = null;
      setIsSelecting(false);
      setSelectionRect(null);
    };

    wrap.addEventListener('pointerdown', onPointerDown, {
      capture: true,
    } as any);
    wrap.addEventListener('pointermove', onPointerMove, {
      capture: true,
    } as any);
    wrap.addEventListener('pointerup', onPointerUp, { capture: true } as any);
    wrap.addEventListener('pointercancel', onPointerUp, {
      capture: true,
    } as any);

    return () => {
      wrap.removeEventListener('pointerdown', onPointerDown, true as any);
      wrap.removeEventListener('pointermove', onPointerMove, true as any);
      wrap.removeEventListener('pointerup', onPointerUp, true as any);
      wrap.removeEventListener('pointercancel', onPointerUp, true as any);
    };
  }, [setNodes, selectionRect]);

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
    <div ref={wrapperRef} style={{ height: '100vh', position: 'relative' }}>
      {/* <div style={{ marginBottom: 8 }}>
        <button onClick={addNode}>Add node</button>{' '}
        <span style={{ marginLeft: 8, opacity: 0.6 }}>Room {getRoomId()}</span>
      </div> */}
      <ReactFlow
        ref={flowRef}
        nodeTypes={useMemo(() => ({ basic: BasicNode }), [])}
        nodes={nodes.map((n) => {
          // apply remote selection outlines
          const owner = Object.entries(remoteSelections).find(([_, s]) =>
            s.ids.includes(n.id),
          );
          if (!owner) return n;
          const color = owner[1].color || '#999';
          return {
            ...n,
            style: {
              ...(n as any).style,
              // we use a data attr for CSS to avoid clobbering selected style
              // but inline CSS var for color
              '--remote-outline': color,
            } as React.CSSProperties,
            // attach data attribute via className hack
            className: `${(n as any).className || ''} remote-selected`,
            data: { ...(n as any).data, remoteSelected: true },
          } as any;
        })}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        panOnScroll
        selectionOnDrag={false}
        panOnDrag={panOnDrag}
        selectionMode={SelectionMode.Partial}
        fitView
        className="w-full h-full top-0"
      >
        {/* <MiniMap /> */}
        {/* <Controls /> */}
        <Background />
      </ReactFlow>
      {/* Marquee selection overlay */}
      {isSelecting && selectionRect && (
        <div
          style={{
            position: 'absolute',
            left: selectionRect.x,
            top: selectionRect.y,
            width: selectionRect.w,
            height: selectionRect.h,
            border: `1px solid ${myColor}`,
            background: 'rgba(22, 119, 255, 0.08)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Remote marquees (flow -> screen for both corners) */}
      {Object.entries(remoteMarquees).map(([id, m]) => {
        const wrapRect = wrapperRef.current?.getBoundingClientRect();
        const tl = flowToScreenPosition({ x: m.rect.x, y: m.rect.y });
        const br = flowToScreenPosition({
          x: m.rect.x + m.rect.w,
          y: m.rect.y + m.rect.h,
        });
        const left = tl.x - (wrapRect?.left || 0);
        const top = tl.y - (wrapRect?.top || 0);
        const width = br.x - tl.x;
        const height = br.y - tl.y;
        return (
          <div
            key={`marquee-${id}`}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              border: `1px dashed ${m.color || '#999'}`,
              background: 'rgba(153,153,153,0.08)',
              pointerEvents: 'none',
            }}
            title={m.name || id}
          />
        );
      })}

      {/* Context menu */}
      {menu && (
        <div
          className="pk-flow-menu"
          style={{
            position: 'absolute',
            left: menu.x,
            top: menu.y,
            background: '#fff',
            border: '1px solid #e5e5e5',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            borderRadius: 8,
            padding: 8,
            zIndex: 1000,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addNodeAt(menu.fx, menu.fy);
              setMenu(null);
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 8px',
            }}
          >
            Add node here
          </button>
        </div>
      )}

      {/* Cursor overlay (flow -> screen) */}
      {Object.entries(remoteCursors).map(([id, c]) => {
        const wrapRect = wrapperRef.current?.getBoundingClientRect();
        const p = flowToScreenPosition({ x: c.x, y: c.y });
        const left = p.x - (wrapRect?.left || 0);
        const top = p.y - (wrapRect?.top || 0);
        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left,
              top,
              pointerEvents: 'none',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              style={{ color: c.color, filter: 'drop-shadow(0 0 2px #fff)' }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: 'block' }}
              >
                <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />
              </svg>
            </div>
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
        );
      })}
    </div>
  );
}

export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
