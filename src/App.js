import './App.css';
import { useEffect, useState } from 'react';

function App() {
  const [backendHealth, setBackendHealth] = useState('loading');
  const [mlHealth, setMlHealth] = useState('loading');
  const [ideas, setIdeas] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [backendResponse, mlResponse, ideasResponse] = await Promise.all([
          fetch('/api/healthz'),
          fetch('/ml/healthz'),
          fetch('/api/v1/ideas'),
        ]);

        const backend = await backendResponse.json();
        const ml = await mlResponse.json();
        const ideaList = await ideasResponse.json();

        setBackendHealth(`${backend.status} / db ${backend.db_time}`);
        setMlHealth(`${ml.status} / uptime ${ml.uptime_seconds}s`);
        setIdeas(ideaList);
      } catch (error) {
        setBackendHealth('unreachable');
        setMlHealth('unreachable');
        setIdeas([]);
      }
    };

    load();
  }, []);

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Hackathon Starter</p>
        <h1>Ship the demo before the judges sit down.</h1>
        <p className="lede">
          React on the edge, Zig in the core, FastAPI for ML, and an
          observability stack that makes failures visible before they become
          embarrassing.
        </p>
        <div className="hero-grid">
          <article className="status-card">
            <span>Backend</span>
            <strong>{backendHealth}</strong>
          </article>
          <article className="status-card">
            <span>ML</span>
            <strong>{mlHealth}</strong>
          </article>
          <article className="status-card accent">
            <span>Ingress</span>
            <strong>Traefik + Compose + LGTM-style telemetry</strong>
          </article>
        </div>
      </section>

      <section className="board">
        <div className="board-copy">
          <p className="section-label">Tracks</p>
          <h2>Default project ideas seeded from Postgres</h2>
          <p>
            The backend reads from Postgres, the ML service exposes predictions,
            and the stack routes everything through Traefik.
          </p>
        </div>
        <div className="idea-list">
          {ideas.map((idea) => (
            <article className="idea-card" key={idea.name}>
              <p>{idea.track}</p>
              <h3>{idea.name}</h3>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
