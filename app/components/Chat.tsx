import React, { useEffect, useRef, useState } from 'react';
import usePartySocket from 'partysocket/react';
import { getIdentity, setIdentity } from '../identity';

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

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [count, setCount] = useState<number>(1);
  const base = getIdentity();
  const [userId] = useState(base.userId);
  const [name, setName] = useState<string>(base.name);
  const [color, setColor] = useState<string>(base.color);
  const [avatar, setAvatar] = useState<string | undefined>(base.avatar);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const socket = usePartySocket({
    room: 'chat',
    onMessage(evt) {
      try {
        const msg = JSON.parse(evt.data) as { type: string; payload?: unknown };
        if (msg.type === 'init') {
          setMessages((msg.payload as ChatMessage[]) ?? []);
        } else if (msg.type === 'chat') {
          setMessages((m) => [...m, msg.payload as ChatMessage]);
        } else if (msg.type === 'presence') {
          const { count } = msg as unknown as {
            type: 'presence';
            count: number;
          };
          setCount(count);
        } else if (msg.type === 'typing') {
          const { from } = msg.payload as any;
          setTypingUsers((prev) => ({ ...prev, [from]: Date.now() }));
        }
      } catch (e) {
        // ignore
      }
    },
    onOpen() {
      const merged = setIdentity({ name, color, avatar });
      socket.send(
        JSON.stringify({
          type: 'identify',
          payload: merged,
        }),
      );
    },
  });

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages.length]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const message: ChatMessage = {
      id: Math.random().toString(36).slice(2, 10),
      userId,
      text,
      ts: Date.now(),
    };
    const enriched: ChatMessage = { ...message, name, color, avatar };
    setMessages((m) => [...m, enriched]);
    socket.send(
      JSON.stringify({
        type: 'chat',
        payload: enriched,
      }),
    );
  };

  const sendImage = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const message: ChatMessage = {
        id: Math.random().toString(36).slice(2, 10),
        userId,
        image: dataUrl,
        ts: Date.now(),
        name,
        color,
        avatar,
      };
      setMessages((m) => [...m, message]);
      socket.send(JSON.stringify({ type: 'chat', payload: message }));
    };
    reader.readAsDataURL(file);
  };

  // keep identity in sync if Profile updates while chat is open
  useEffect(() => {
    const onUpdate = (e: any) => {
      const next = e.detail as ReturnType<typeof getIdentity>;
      setName(next.name);
      setColor(next.color);
      setAvatar(next.avatar);
      socket.send(JSON.stringify({ type: 'identify', payload: next }));
    };
    window.addEventListener('pk-identity-updated' as any, onUpdate);
    return () =>
      window.removeEventListener('pk-identity-updated' as any, onUpdate);
  }, [socket]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 480 }}>
      <h2>
        Chat ({count} {count === 1 ? 'user' : 'users'})
      </h2>
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          border: '1px solid #ddd',
          padding: 12,
          borderRadius: 8,
        }}
      >
        {messages.map((m) => {
          const isSelf = m.userId === userId;
          const bubbleBg = isSelf ? '#e6f7ff' : '#f5f5f5';
          const displayName = m.name ?? m.userId;
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: isSelf ? 'flex-end' : 'flex-start',
                margin: '8px 0',
                alignItems: 'flex-end',
              }}
            >
              {!isSelf && (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: m.color || '#ddd',
                    overflow: 'hidden',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    flex: '0 0 32px',
                  }}
                >
                  {m.avatar ? (
                    <img
                      src={m.avatar}
                      alt={displayName}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    (displayName || '?').slice(0, 1).toUpperCase()
                  )}
                </div>
              )}
              <div
                style={{
                  display: 'inline-block',
                  background: bubbleBg,
                  padding: '8px 12px',
                  borderRadius: 12,
                  maxWidth: '70%',
                  border: `2px solid ${m.color || '#e5e7eb'}`,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.7, color: m.color }}>
                  {displayName}
                </div>
                {m.text && <div>{m.text}</div>}
                {m.image && (
                  <div style={{ marginTop: 6 }}>
                    <img
                      src={m.image}
                      alt="sent"
                      style={{ maxWidth: 320, borderRadius: 8 }}
                    />
                  </div>
                )}
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
                  {new Date(m.ts).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
              </div>
              {isSelf && (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: m.color || '#1677ff',
                    overflow: 'hidden',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    flex: '0 0 32px',
                  }}
                >
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={displayName}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    (displayName || '?').slice(0, 1).toUpperCase()
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* typing indicator */}
      {Object.keys(typingUsers).length > 0 && (
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
          someone is typing…
        </div>
      )}
      <div
        style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}
      >
        <input
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: '1px solid #ccc',
          }}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (!isTyping) {
              setIsTyping(true);
              socket.send(JSON.stringify({ type: 'typing' }));
              setTimeout(() => setIsTyping(false), 1000);
            }
          }}
          placeholder="Type a message"
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
        />
        <label style={{ display: 'inline-block' }}>
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => sendImage(e.target.files?.[0] ?? null)}
          />
          <span
            style={{
              display: 'inline-block',
              padding: '8px 12px',
              border: '1px solid #ccc',
              borderRadius: 8,
              cursor: 'pointer',
              background: '#fafafa',
            }}
          >
            Image
          </span>
        </label>
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}
