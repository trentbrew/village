import React from 'react';
import './styles.css';
import { createRoot } from 'react-dom/client';
import Counter from './components/Counter';
import NavBar from './components/NavBar';
import FlowCanvas from './components/FlowCanvas';
import Chat from './components/Chat';
import Profile from './components/Profile';

function App() {
  const [hash, setHash] = React.useState<string>(
    typeof window !== 'undefined'
      ? window.location.hash || '#/counter'
      : '#/counter',
  );

  React.useEffect(() => {
    const onHashChange = () => setHash(window.location.hash || '#/counter');
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.location.hash = '#/counter';
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div>
      <NavBar />
      <main style={{ padding: '1rem' }}>
        {hash === '#/counter' && (
          <section>
            <h2>Counter</h2>
            <p>
              <i>Multiplayer counter. Open multiple tabs to see updates.</i>
            </p>
            <Counter />
          </section>
        )}
        {hash === '#/flow' && (
          <section>
            <h2>Multiplayer React Flow</h2>
            <FlowCanvas />
          </section>
        )}
        {hash === '#/chat' && (
          <section>
            <Chat />
          </section>
        )}
        {hash === '#/profile' && (
          <section>
            <Profile />
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
