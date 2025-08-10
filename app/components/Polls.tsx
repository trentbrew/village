import React from 'react';
import usePartySocket from 'partysocket/react';
import { featureRoom } from '../rooms';
import { getIdentity } from '../identity';

type Poll = {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, number>; // optionIndex -> count
};

type PollsMessage =
  | { type: 'init'; polls: Poll[] }
  | { type: 'polls'; polls: Poll[] }
  | { type: 'voted'; pollId: string; option: number };

export default function Polls() {
  const ident = getIdentity();
  const [polls, setPolls] = React.useState<Poll[]>([]);
  const [question, setQuestion] = React.useState('');
  const [optionsText, setOptionsText] = React.useState('Yes\nNo');

  const socket = usePartySocket({
    room: featureRoom('polls'),
    onOpen() {
      socket.send(JSON.stringify({ type: 'identify', payload: ident }));
    },
    onMessage(e) {
      try {
        const msg = JSON.parse(e.data) as PollsMessage;
        if (msg.type === 'init' || msg.type === 'polls') {
          setPolls((msg as any).polls);
        } else if (msg.type === 'voted') {
          // optimistically handled via 'polls' usually; keep for completeness
        }
      } catch {}
    },
  });

  const createPoll = (e: React.FormEvent) => {
    e.preventDefault();
    const options = optionsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!question.trim() || options.length < 2) return;
    socket.send(
      JSON.stringify({
        type: 'create-poll',
        payload: { question: question.trim(), options },
      }),
    );
    setQuestion('');
    setOptionsText('Yes\nNo');
  };

  const vote = (pollId: string, option: number) => {
    socket.send(JSON.stringify({ type: 'vote', payload: { pollId, option } }));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <section>
        <h3>Create a poll</h3>
        <form onSubmit={createPoll} style={{ display: 'grid', gap: 8 }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Question"
          />
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="One option per line"
            rows={4}
          />
          <button type="submit">Create</button>
        </form>
      </section>
      <section>
        <h3>Polls</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          {polls.map((p) => {
            const total = p.options.reduce(
              (sum, _opt, idx) => sum + (p.votes[idx] || 0),
              0,
            );
            return (
              <div
                key={p.id}
                style={{
                  padding: 12,
                  border: '1px solid #eee',
                  borderRadius: 8,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  {p.question}
                </div>
                <ul style={{ display: 'grid', gap: 8 }}>
                  {p.options.map((opt, idx) => {
                    const count = p.votes[idx] || 0;
                    const pct = total ? Math.round((count / total) * 100) : 0;
                    return (
                      <li key={idx} style={{ display: 'grid', gap: 6 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <button onClick={() => vote(p.id, idx)}>Vote</button>
                          <span>{opt}</span>
                          <span
                            style={{
                              marginLeft: 'auto',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: '#f2f2f2',
                            borderRadius: 999,
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              borderRadius: 999,
                              background: '#06f',
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
