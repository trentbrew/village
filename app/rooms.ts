export function getRoomId(): string {
  const m =
    typeof window !== 'undefined'
      ? window.location.pathname.match(/^\/(\w+)/)
      : null;
  return m ? m[1] : 'default';
}

export function featureRoom(
  feature: 'chat' | 'reactflow' | 'presence' | 'counter' | 'editor' | 'polls',
  roomId = getRoomId(),
) {
  if (feature === 'counter') return 'example-room';
  return `${feature}-${roomId}`;
}
