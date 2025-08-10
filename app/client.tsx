import React from 'react';
import './styles.css';
import { createRoot } from 'react-dom/client';
import Counter from './components/Counter';
import NavBar from './components/NavBar';
import FlowCanvas from './components/FlowCanvas';
import Chat from './components/Chat';
import Profile from './components/Profile';
import Editor from './components/Editor';
import Polls from './components/Polls';

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

  // Reflect path-based room scoping: /:roomId/#/page
  const roomId = React.useMemo(() => {
    const m = window.location.pathname.match(/^\/(\w+)/);
    return m ? m[1] : 'default';
  }, []);

  return (
    <div>
      <NavBar />
      <main style={{ padding: '0' }}>
        {hash === '#/counter' && (
          <section>
            <Counter />
          </section>
        )}
        {hash === '#/flow' && (
          <section>
            <FlowCanvas />
          </section>
        )}
        {hash === '#/chat' && (
          <section>
            <Chat />
          </section>
        )}
        {hash === '#/editor' && (
          <section>
            <h2>Collaborative Editor</h2>
            <Editor />
          </section>
        )}
        {hash === '#/polls' && (
          <section>
            <h2>Realtime Polls</h2>
            <Polls />
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
