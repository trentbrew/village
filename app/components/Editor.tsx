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
      selStart?: number;
      selEnd?: number;
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
        selStart?: number;
        selEnd?: number;
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
              selStart: (msg as any).selStart,
              selEnd: (msg as any).selEnd,
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
    const selStart = el.selectionStart ?? pos;
    const selEnd = el.selectionEnd ?? pos;
    socket.send(
      JSON.stringify({
        type: 'cursor',
        payload: {
          pos,
          name: ident.name,
          color: ident.color,
          selStart,
          selEnd,
        },
      }),
    );
  }, [socket, ident]);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const scheduleSend = (() => {
      let rafId: number | null = null;
      return () => {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          sendCursor();
          rafId = null;
        });
      };
    })();

    let isMouseDown = false;
    const onKeyUp = () => scheduleSend();
    const onClick = () => scheduleSend();
    const onSelect = () => scheduleSend();
    const onMouseDown = () => {
      isMouseDown = true;
      scheduleSend();
    };
    const onMouseUp = () => {
      isMouseDown = false;
      scheduleSend();
    };
    const onMouseMove = () => {
      if (isMouseDown) scheduleSend();
    };
    const onTouchStart = () => {
      isMouseDown = true;
      scheduleSend();
    };
    const onTouchEnd = () => {
      isMouseDown = false;
      scheduleSend();
    };
    const onTouchMove = () => {
      if (isMouseDown) scheduleSend();
    };
    const onSelectionChange = () => {
      if (document.activeElement === el) scheduleSend();
    };

    el.addEventListener('keyup', onKeyUp);
    el.addEventListener('click', onClick);
    el.addEventListener('select', onSelect as any);
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('touchstart', onTouchStart, { passive: true } as any);
    el.addEventListener('touchend', onTouchEnd, { passive: true } as any);
    el.addEventListener('touchmove', onTouchMove, { passive: true } as any);
    document.addEventListener('selectionchange', onSelectionChange);

    return () => {
      el.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('click', onClick);
      el.removeEventListener('select', onSelect as any);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('touchstart', onTouchStart as any);
      el.removeEventListener('touchend', onTouchEnd as any);
      el.removeEventListener('touchmove', onTouchMove as any);
      document.removeEventListener('selectionchange', onSelectionChange);
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
          {/* Peer selection highlights */}
          {Object.entries(peerCursors).map(([id, c]) => {
            const start = c.selStart ?? c.pos;
            const end = c.selEnd ?? c.pos;
            if (start === undefined || end === undefined || start === end)
              return null;
            const el = textareaRef.current;
            if (!el) return null;
            const rects = getTextareaSelectionClientRects(
              el,
              Math.min(start, end),
              Math.max(start, end),
              content,
            );
            return rects.map((r, idx) => (
              <div
                key={`${id}-${idx}`}
                style={{
                  position: 'absolute',
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: r.height,
                  background: 'rgba(32, 127, 255, 0.15)',
                  borderLeft: `2px solid ${c.color || '#207fff'}`,
                  borderRadius: 2,
                }}
              />
            ));
          })}
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

// Compute selection rectangles by mirroring the textarea content
function getTextareaSelectionClientRects(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
) {
  if (start === end)
    return [] as Array<{
      top: number;
      left: number;
      width: number;
      height: number;
    }>;
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

  const taRect = textarea.getBoundingClientRect();
  div.style.left = `${taRect.left + window.scrollX}px`;
  div.style.top = `${taRect.top + window.scrollY}px`;
  div.style.width = `${textarea.clientWidth}px`;

  const before = document.createTextNode(text.slice(0, start));
  const spanSel = document.createElement('span');
  spanSel.textContent = text.slice(start, end) || ' ';
  const after = document.createTextNode(text.slice(end) || '.');
  div.appendChild(before);
  div.appendChild(spanSel);
  div.appendChild(after);

  document.body.appendChild(div);
  const rects = Array.from(spanSel.getClientRects());
  const borderTop = parseFloat(style.borderTopWidth || '0');
  const borderLeft = parseFloat(style.borderLeftWidth || '0');
  const results = rects.map((r) => ({
    top: r.top - taRect.top - textarea.scrollTop + borderTop,
    left: r.left - taRect.left - textarea.scrollLeft + borderLeft,
    width: r.width,
    height: r.height,
  }));
  document.body.removeChild(div);
  return results;
}
