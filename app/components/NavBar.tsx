import React from 'react';
import usePartySocket from 'partysocket/react';
import { getIdentity } from '../identity';
import { featureRoom } from '../rooms';

type NavItem = {
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Counter', href: '#/counter' },
  { label: 'Canvas', href: '#/flow' },
  { label: 'Chat', href: '#/chat' },
  { label: 'Editor', href: '#/editor' },
  { label: 'Polls', href: '#/polls' },
  { label: 'Profile', href: '#/profile' },
];

export default function NavBar() {
  const current =
    typeof window !== 'undefined'
      ? window.location.hash || '#/counter'
      : '#/counter';

  const ident = getIdentity();
  const [roster, setRoster] = React.useState<
    Array<{
      userId: string;
      name: string;
      color: string;
      avatar?: string;
      page: string;
    }>
  >([]);
  const presence = usePartySocket({
    room: featureRoom('presence'),
    onOpen() {
      presence.send(
        JSON.stringify({
          type: 'identify',
          payload: { ...ident, page: current },
        }),
      );
    },
    onMessage(e) {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'roster') setRoster(msg.payload || []);
      } catch {}
    },
  });

  React.useEffect(() => {
    const onHash = () =>
      presence.send(
        JSON.stringify({
          type: 'page',
          payload: { page: window.location.hash },
        }),
      );
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [presence]);

  return (
    <nav className="navbar fixed bottom-0 left-0 right-0 z-50">
      <ul className="navbar-links">
        {NAV_ITEMS.map((item) => {
          const isActive = current === item.href;
          const countOnPage = roster.filter((u) => u.page === item.href).length;
          return (
            <li key={item.href}>
              <a
                className={'nav-link' + (isActive ? ' active' : '')}
                href={item.href}
              >
                {item.label}
              </a>
              {countOnPage > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    background: '#eee',
                    padding: '2px 6px',
                    borderRadius: 999,
                  }}
                >
                  {countOnPage}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {roster.slice(0, 3).map((u) => (
          <div
            key={u.userId}
            title={`${u.name} ${u.page}`}
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              overflow: 'hidden',
              border: '2px solid #fff',
              boxShadow: '0 0 0 1px #ddd',
            }}
          >
            {u.avatar ? (
              <img
                src={u.avatar}
                alt={u.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: u.color,
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                }}
              >
                {u.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        ))}
        {roster.length > 3 && (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              background: '#000',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: 10,
            }}
          >
            +{roster.length - 3}
          </div>
        )}
      </div>
    </nav>
  );
}
