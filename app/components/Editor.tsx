import React from 'react';
import usePartySocket from 'partysocket/react';
import { featureRoom } from '../rooms';
import { getIdentity } from '../identity';

type EditorMessage =
  | { type: 'init'; content: string; version: number }
  | { type: 'edit'; content: string; version: number }
  | {
      type: 'cursor';
      from: string;
      pos: number;
      name?: string;
      color?: string;
    };

export default function Editor() {
  const ident = getIdentity();
  const [content, setContent] = React.useState('');
  const [version, setVersion] = React.useState(0);
  const [peerCursors, setPeerCursors] = React.useState<
    Record<
      string,
      {
        pos: number;
        name?: string;
        color?: string;
      }
    >
  >({});

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const [cursorPositions, setCursorPositions] = React.useState<
    Record<
      string,
      {
        top: number;
        left: number;
        height: number;
        name?: string;
        color?: string;
      }
    >
  >({});

  const socket = usePartySocket({
    room: featureRoom('editor'),
    onOpen() {
      socket.send(JSON.stringify({ type: 'identify', payload: ident }));
    },
    onMessage(e) {
      try {
        const msg = JSON.parse(e.data) as EditorMessage;
        if (msg.type === 'init') {
          setContent(msg.content);
          setVersion(msg.version);
        } else if (msg.type === 'edit') {
          setContent(msg.content);
          setVersion(msg.version);
        } else if (msg.type === 'cursor') {
          setPeerCursors((prev) => ({
            ...prev,
            [msg.from]: {
              pos: msg.pos,
              name: (msg as any).name,
              color: (msg as any).color,
            },
          }));
        }
      } catch {}
    },
  });

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setContent(next);
    const nextVersion = version + 1;
    setVersion(nextVersion);
    socket.send(
      JSON.stringify({
        type: 'edit',
        payload: { content: next, version: nextVersion },
      }),
    );
  };

  const sendCursor = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? 0;
    socket.send(
      JSON.stringify({
        type: 'cursor',
        payload: { pos, name: ident.name, color: ident.color },
      }),
    );
  }, [socket, ident]);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const handler = () => sendCursor();
    el.addEventListener('keyup', handler);
    el.addEventListener('click', handler);
    el.addEventListener('select', handler as any);
    return () => {
      el.removeEventListener('keyup', handler);
      el.removeEventListener('click', handler);
      el.removeEventListener('select', handler as any);
    };
  }, [sendCursor]);

  // Compute peer caret positions when content or peer cursors change
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const positions: Record<
      string,
      {
        top: number;
        left: number;
        height: number;
        name?: string;
        color?: string;
      }
    > = {};
    for (const [id, c] of Object.entries(peerCursors)) {
      const pos = Math.max(0, Math.min(c.pos ?? 0, content.length));
      const coords = getTextareaCaretCoordinates(el, pos, content);
      positions[id] = { ...coords, name: c.name, color: c.color };
    }
    setCursorPositions(positions);
  }, [peerCursors, content]);

  // Recalculate on scroll/resize for alignment
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const handler = () => {
      const positions: Record<
        string,
        {
          top: number;
          left: number;
          height: number;
          name?: string;
          color?: string;
        }
      > = {};
      for (const [id, c] of Object.entries(peerCursors)) {
        const pos = Math.max(0, Math.min(c.pos ?? 0, content.length));
        const coords = getTextareaCaretCoordinates(el, pos, content);
        positions[id] = { ...coords, name: c.name, color: c.color };
      }
      setCursorPositions(positions);
    };
    el.addEventListener('scroll', handler);
    window.addEventListener('resize', handler);
    return () => {
      el.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, [peerCursors, content]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 16 }}>
      <div ref={wrapperRef} style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={onChange}
          placeholder="Type with others..."
          rows={14}
          style={{
            width: '100%',
            fontFamily: 'monospace',
            fontSize: 14,
            padding: 12,
            lineHeight: '1.4',
            tabSize: 2,
          }}
        />
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {Object.entries(cursorPositions).map(([id, p]) => (
            <div
              key={id}
              style={{ position: 'absolute', left: p.left, top: p.top }}
            >
              <div
                style={{
                  width: 2,
                  height: p.height,
                  background: p.color || '#000',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.05)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 4,
                  top: -18,
                  background: p.color || '#000',
                  color: '#fff',
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name || id.slice(0, 4)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <aside>
        <ul style={{ display: 'grid', gap: 8 }}>
          {Object.entries(peerCursors).map(([id, c]) => (
            <li
              key={id}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: c.color || '#999',
                  display: 'inline-block',
                }}
              />
              <span>
                {c.name || id.slice(0, 4)} @ {c.pos}
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

// Mirror-based caret measurement utility
function getTextareaCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
  text: string,
) {
  const style = window.getComputedStyle(textarea);
  const div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  (div.style as any).wordWrap = 'break-word';
  div.style.overflow = 'hidden';

  const props = [
    'direction',
    'boxSizing',
    'width',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'letterSpacing',
    'tabSize',
  ] as const;
  for (const prop of props) {
    (div.style as any)[prop] =
      (style as any)[prop] ?? style.getPropertyValue(prop as any);
  }

  const rect = textarea.getBoundingClientRect();
  div.style.left = `${rect.left + window.scrollX}px`;
  div.style.top = `${rect.top + window.scrollY}px`;
  div.style.width = `${textarea.clientWidth}px`;

  const before = document.createTextNode(text.slice(0, position));
  const span = document.createElement('span');
  span.textContent = '\u200b';
  const after = document.createTextNode(text.slice(position) || '.');
  div.appendChild(before);
  div.appendChild(span);
  div.appendChild(after);

  document.body.appendChild(div);
  const top =
    span.offsetTop -
    textarea.scrollTop +
    parseFloat(style.borderTopWidth || '0');
  const left =
    span.offsetLeft -
    textarea.scrollLeft +
    parseFloat(style.borderLeftWidth || '0');
  const lineHeight = parseFloat(style.lineHeight || '16');
  document.body.removeChild(div);
  return { top, left, height: lineHeight };
}
