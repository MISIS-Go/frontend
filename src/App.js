import './App.css';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { startTransition, useCallback, useEffect, useState } from 'react';
import NavigationBar from './components/NavigationBar';
import { useAuth } from './contexts/AuthContext';
import { authService } from './services/authService';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

const moodboards = [
  { id: 'sunrise', title: 'Sunrise Reset', description: 'Теплый визуальный режим для мягких, но заметных предупреждений.' },
  { id: 'forest', title: 'Forest Focus', description: 'Спокойная палитра для восстановления и длинной концентрации.' },
  { id: 'paper', title: 'Paper Quiet', description: 'Светлая нейтральная тема для ненавязчивого мониторинга.' },
];

const defaultSettings = {
  user_id: 'demo-user',
  notification_frequency_minutes: 30,
  moodboard: 'sunrise',
  site_limits: [],
};

const defaultStats = {
  user_id: 'demo-user',
  sites: [],
  recent_visits: [],
  totals: {
    total_time_spent: 0,
    average_anxiety_level: 0,
    tracked_sites: 0,
    alerting_sites: 0,
  },
};

const defaultGeneral = {
  user_id: 'demo-user',
  total_anxiety_level: 0,
  total_time_spent: 0,
  tracked_visits: 0,
  focus_sites: [],
  recommendation: 'Сначала отправьте несколько посещений сайта в анализ, чтобы SafeMind собрал паттерн поведения.',
  wellbeing_score: 100,
};

function secondsToLabel(value) {
  if (!value) return '0 мин';
  const minutes = Math.round(value / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} ч ${remainder} мин` : `${hours} ч`;
}

function anxietyTone(value) {
  if (value >= 75) return 'high';
  if (value >= 55) return 'medium';
  return 'low';
}

async function api(path, options) {
  const token = authService.getToken();
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const raw = await response.text();
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      if (!response.ok) {
        throw new Error(raw);
      }
      throw new Error('Backend returned a non-JSON response');
    }
  }

  if (!response.ok) {
    let message = 'Request failed';
    message = payload.error || response.statusText || message;
    throw new Error(message);
  }

  return payload;
}

function App() {
  const [settings, setSettings] = useState(defaultSettings);
  const [stats, setStats] = useState(defaultStats);
  const [general, setGeneral] = useState(defaultGeneral);
  const [analysis, setAnalysis] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState('');
  const [redirectMessage, setRedirectMessage] = useState('');
  const [limitDraft, setLimitDraft] = useState({ site: '', time_limit_seconds: 900 });
  const [siteForm, setSiteForm] = useState({
    url: 'https://news.example.com/article/123',
    time_spent: 840,
  });
  const { user } = useAuth();
  const USER_ID = user?.id ?? 'demo-user';

  useEffect(() => {
    document.documentElement.dataset.moodboard = settings.moodboard;
  }, [settings.moodboard]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [settingsResponse, statsResponse, generalResponse] = await Promise.all([
        api(`/api/settings?user_id=${USER_ID}`),
        api('/api/site-stats', {
          method: 'POST',
          body: JSON.stringify({ user_id: USER_ID }),
        }),
        api('/api/general-analysis', {
          method: 'POST',
          body: JSON.stringify({ user_id: USER_ID }),
        }),
      ]);

      startTransition(() => {
        setSettings(settingsResponse);
        setStats(statsResponse);
        setGeneral(generalResponse);
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [USER_ID]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function handleAnalyzeSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      const [analysisResponse, predictionResponse] = await Promise.all([
        api('/api/analyze-site', {
          method: 'POST',
          body: JSON.stringify({
            user_id: USER_ID,
            url: siteForm.url,
            time_spent: Number(siteForm.time_spent),
          }),
        }),
        api('/api/time-prediction', {
          method: 'POST',
          body: JSON.stringify({
            user_id: USER_ID,
            url: siteForm.url,
          }),
        }),
      ]);

      startTransition(() => {
        setAnalysis(analysisResponse);
        setPrediction(predictionResponse);
      });

      const configuredLimit = settings.site_limits.find((item) => item.site === analysisResponse.site)?.time_limit_seconds;
      const shouldRedirect = (configuredLimit && Number(siteForm.time_spent) >= configuredLimit) || analysisResponse.anxiety_level >= 80;

      if (shouldRedirect) {
        setRedirectMessage('Вы провели слишком много времени на этом сайте. Пора сделать перерыв!');
        window.location.hash = 'break-room';
      } else {
        setRedirectMessage('');
      }

      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    setError('');

    try {
      const response = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(response);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingSettings(false);
    }
  }

  function addLimitDraft() {
    if (!limitDraft.site.trim()) return;

    const nextLimit = {
      site: limitDraft.site.trim().toLowerCase(),
      time_limit_seconds: Number(limitDraft.time_limit_seconds),
    };

    setSettings((current) => ({
      ...current,
      site_limits: [...current.site_limits.filter((item) => item.site !== nextLimit.site), nextLimit].sort((a, b) =>
        a.site.localeCompare(b.site),
      ),
    }));
    setLimitDraft({ site: '', time_limit_seconds: 900 });
  }

  function removeLimit(site) {
    setSettings((current) => ({
      ...current,
      site_limits: current.site_limits.filter((item) => item.site !== site),
    }));
  }

  const doughnutData = {
    labels: stats.sites.map((site) => site.site),
    datasets: [
      {
        data: stats.sites.map((site) => site.time_spent),
        backgroundColor: ['#ff8f5a', '#f4c95d', '#78c6a3', '#5f87ff', '#cf8dfc', '#ff6f91'],
        borderWidth: 0,
      },
    ],
  };

  const barData = {
    labels: stats.sites.map((site) => site.site),
    datasets: [
      {
        data: stats.sites.map((site) => site.anxiety_level),
        backgroundColor: stats.sites.map((site) => {
          const tone = anxietyTone(site.anxiety_level);
          if (tone === 'high') return '#ff6b6b';
          if (tone === 'medium') return '#f6ad55';
          return '#57c39a';
        }),
        borderRadius: 12,
      },
    ],
  };

  const lineData = {
    labels: [...stats.recent_visits].reverse().map((visit) => visit.site),
    datasets: [
      {
        label: 'Последние сессии',
        data: [...stats.recent_visits].reverse().map((visit) => Math.round(visit.time_spent / 60)),
        borderColor: '#5f87ff',
        backgroundColor: 'rgba(95, 135, 255, 0.18)',
        tension: 0.35,
        fill: true,
      },
    ],
  };

  return (
    <>
      <NavigationBar />
      <main className="app-shell">
        <section className="hero">
          <div className="hero-navline">
            <img src="/03/div.header__row.jpg" alt="Навигация SafeMind" className="header-row-image" />
          </div>

          <div className="hero-copy">
            <p className="eyebrow">SafeMind</p>
            <h1>Интерфейс цифровой гигиены для людей, которым важно, что делает с ними контент.</h1>
          </div>

          <div className="hero-editorial">
            <article className="editorial-card">
              <p className="section-label">Настрой заботу о пространстве, в котором ты живешь каждый день</p>
              <p className="lede">
                SafeMind собирает пользовательскую статистику, определяет тревожность контента, прогнозирует
                перегрузку и возвращает человеку ощущение контроля над цифровой средой.
              </p>
              <button type="button" onClick={() => window.location.hash = 'analytics'}>
                Смотреть аналитику
              </button>
            </article>

            <article className="hero-art">
              <div className="hero-collage">
                <img src="/03/div.section-1.jpg" alt="Фрагмент пространства SafeMind" className="hero-collage-main" />
                <img src="/03/div.section.jpg" alt="Карточки и события SafeMind" className="hero-collage-side" />
              </div>
            </article>
          </div>

          <blockquote className="hero-quote">
            <span className="quote-mark">“</span>
            <p>
              Плохой не ты, где заканчивается дизайн.
              <br />
              Он здесь, в трёх дубовых окнах перед рабочим окном.
            </p>
            <span className="quote-mark">”</span>
          </blockquote>

          <section className="manifesto">
            <div className="manifesto-illustration">
              <img src="/03/div.section-1.jpg" alt="Витрина центра" className="manifesto-image" />
            </div>
            <div className="manifesto-copy">
              <p className="section-label">SafeMind</p>
              <h2>Инструмент для людей, если бурлит.</h2>
              <p className="summary-copy">
                Интерфейс объединяет backend на Go, ML-анализ тревожности и компактную визуализацию, чтобы пользователь
                видел не просто цифры, а собственный ритм, уровень давления и области, где стоит замедлиться.
              </p>
              <div className="profile-strip">
                <article className="profile-card">
                  <span>Пользователь</span>
                  <strong>{user?.display_name || 'Demo User'}</strong>
                  <p>{user?.email || 'Локальный demo-режим без авторизации'}</p>
                </article>
                <article className="profile-card">
                  <span>Отслеживаемые сайты</span>
                  <strong>{stats.totals.tracked_sites}</strong>
                  <p>Уникальные домены в пользовательской статистике.</p>
                </article>
                <article className="profile-card">
                  <span>Сохраненные визиты</span>
                  <strong>{general.tracked_visits}</strong>
                  <p>История поведения, на которой строятся рекомендации.</p>
                </article>
              </div>
            </div>
          </section>

          <section className="moodboard-showcase" id="moodboard">
            <div className="panel-head center">
              <p className="section-label">Выберите свою среду</p>
              <h2>Подберите атмосферу интерфейса</h2>
            </div>
            <div className="reference-strip">
              <img src="/03/div.section.jpg" alt="Референс карточек и событий" className="reference-strip-image" />
            </div>
            <div className="moodboard-gallery">
              {moodboards.map((moodboard) => (
                <button
                  type="button"
                  key={moodboard.id}
                  className={`moodboard-orb ${settings.moodboard === moodboard.id ? 'is-active' : ''}`}
                  onClick={() => setSettings((current) => ({ ...current, moodboard: moodboard.id }))}
                >
                  <span className={`orb-visual orb-${moodboard.id}`} />
                  <strong>{moodboard.title}</strong>
                  <small>{moodboard.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="reference-column">
            <div className="panel-head center">
              <p className="section-label">Фрагменты интерфейса</p>
              <h2>Детали из визуальной системы</h2>
            </div>
            <img src="/03/component-3.jpg" alt="Декоративный фрагмент интерфейса" className="reference-column-image" />
          </section>

          <div className="hero-grid" id="analytics">
            <article className="metric-card">
              <span>Средняя тревожность</span>
              <strong>{general.total_anxiety_level}%</strong>
              <p>Интегральная оценка цифрового фона пользователя.</p>
            </article>
            <article className="metric-card">
              <span>Экранное время</span>
              <strong>{secondsToLabel(general.total_time_spent)}</strong>
              <p>Суммарное время по отслеженным визитам.</p>
            </article>
            <article className="metric-card">
              <span>Wellbeing score</span>
              <strong>{general.wellbeing_score}/100</strong>
              <p>Чем выше score, тем спокойнее общий паттерн поведения.</p>
            </article>
            <article className="metric-card accent">
              <span>Риск лимита</span>
              <strong>{stats.totals.alerting_sites}</strong>
              <p>Столько доменов уже пересекли лимит.</p>
            </article>
          </div>
        </section>

        {redirectMessage ? (
          <section className="break-banner" id="break-room">
            <div>
              <p className="section-label">SafeMind Break Room</p>
              <h2>{redirectMessage}</h2>
              <p>Сделайте короткую паузу, переключитесь на нейтральный контент или закройте вкладку на несколько минут.</p>
            </div>
            <button type="button" onClick={() => setRedirectMessage('')}>
              Вернуться к дашборду
            </button>
          </section>
        ) : null}

        {error ? <p className="error-banner">{error}</p> : null}

        <section className="workspace">
          <article className="panel">
            <div className="panel-head">
              <p className="section-label">Live Analysis</p>
              <h2>Анализ текущей сессии</h2>
            </div>

            <form className="analyze-form" onSubmit={handleAnalyzeSubmit}>
              <label>
                URL
                <input
                  value={siteForm.url}
                  onChange={(event) => setSiteForm((current) => ({ ...current, url: event.target.value }))}
                  placeholder="https://news.example.com/article"
                />
              </label>
              <label>
                Время на сайте, сек
                <input
                  type="number"
                  min="0"
                  value={siteForm.time_spent}
                  onChange={(event) => setSiteForm((current) => ({ ...current, time_spent: event.target.value }))}
                />
              </label>
              <button type="submit">Проанализировать</button>
            </form>

            <div className="analysis-grid">
              <article className="insight-card">
                <span>ML анализ</span>
                <strong>{analysis ? `${analysis.anxiety_level}% • ${analysis.content_type}` : 'Ожидает запуска'}</strong>
                <p>{analysis ? analysis.summary : 'SafeMind определит уровень тревожности и тип контента.'}</p>
              </article>
              <article className="insight-card">
                <span>Прогноз времени</span>
                <strong>{prediction ? secondsToLabel(prediction.predicted_time) : 'Нет прогноза'}</strong>
                <p>{prediction ? prediction.recommendation : 'После анализа появится прогноз времени и совет.'}</p>
              </article>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <p className="section-label">Behavior Summary</p>
              <h2>Общий прогноз</h2>
            </div>
            <p className="summary-copy">{general.recommendation}</p>
            <div className="focus-list">
              {general.focus_sites.map((site) => (
                <article className="focus-card" key={site.site}>
                  <div>
                    <strong>{site.site}</strong>
                    <span>{site.content_type}</span>
                  </div>
                  <p>{secondsToLabel(site.time_spent)}</p>
                  <mark className={`tone-${anxietyTone(site.anxiety_level)}`}>{site.anxiety_level}%</mark>
                </article>
              ))}
            </div>
          </article>
        </section>

        <section className="charts-grid">
          <article className="panel chart-panel">
            <div className="panel-head">
              <p className="section-label">Time Share</p>
              <h2>Куда уходит внимание</h2>
            </div>
            {stats.sites.length ? <Doughnut data={doughnutData} options={{ plugins: { legend: { position: 'bottom' } } }} /> : <p className="empty-copy">Пока нет данных для диаграммы.</p>}
          </article>

          <article className="panel chart-panel">
            <div className="panel-head">
              <p className="section-label">Anxiety Map</p>
              <h2>Тревожность по доменам</h2>
            </div>
            {stats.sites.length ? (
              <Bar
                data={barData}
                options={{
                  plugins: { legend: { display: false } },
                  scales: { y: { min: 0, max: 100 } },
                }}
              />
            ) : (
              <p className="empty-copy">Сначала отправьте несколько анализов сайта.</p>
            )}
          </article>

          <article className="panel chart-panel full-width">
            <div className="panel-head">
              <p className="section-label">Recent Sessions</p>
              <h2>Последние визиты</h2>
            </div>
            {stats.recent_visits.length ? (
              <Line
                data={lineData}
                options={{
                  plugins: { legend: { display: false } },
                  scales: {
                    y: {
                      title: { display: true, text: 'Минуты' },
                    },
                  },
                }}
              />
            ) : (
              <p className="empty-copy">Линия появится после первых сохраненных сессий.</p>
            )}
          </article>
        </section>

        <section className="workspace">
          <article className="panel">
            <div className="panel-head">
              <p className="section-label">Settings</p>
              <h2>Лимиты и уведомления</h2>
            </div>

            <label className="settings-field">
              Частота уведомлений, минут
              <input
                type="number"
                min="5"
                max="240"
                value={settings.notification_frequency_minutes}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    notification_frequency_minutes: Number(event.target.value),
                  }))
                }
              />
            </label>

            <div className="limit-editor">
              <label>
                Домен
                <input
                  value={limitDraft.site}
                  onChange={(event) => setLimitDraft((current) => ({ ...current, site: event.target.value }))}
                  placeholder="news.example.com"
                />
              </label>
              <label>
                Лимит, сек
                <input
                  type="number"
                  min="60"
                  value={limitDraft.time_limit_seconds}
                  onChange={(event) => setLimitDraft((current) => ({ ...current, time_limit_seconds: event.target.value }))}
                />
              </label>
              <button type="button" onClick={addLimitDraft}>
                Добавить лимит
              </button>
            </div>

            <div className="limit-list">
              {settings.site_limits.map((limit) => (
                <article className="limit-chip" key={limit.site}>
                  <div>
                    <strong>{limit.site}</strong>
                    <span>{secondsToLabel(limit.time_limit_seconds)}</span>
                  </div>
                  <button type="button" onClick={() => removeLimit(limit.site)}>
                    Удалить
                  </button>
                </article>
              ))}
            </div>

            <button className="primary-action" type="button" onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? 'Сохраняю...' : 'Сохранить настройки'}
            </button>
          </article>

          <article className="panel">
            <div className="panel-head">
              <p className="section-label">Moodboard</p>
              <h2>Оформление интерфейса</h2>
            </div>
            <div className="moodboard-list">
              {moodboards.map((moodboard) => (
                <button
                  type="button"
                  key={moodboard.id}
                  className={`moodboard-card ${settings.moodboard === moodboard.id ? 'is-active' : ''}`}
                  onClick={() => setSettings((current) => ({ ...current, moodboard: moodboard.id }))}
                >
                  <strong>{moodboard.title}</strong>
                  <span>{moodboard.description}</span>
                </button>
              ))}
            </div>
          </article>
        </section>

        <section className="panel table-panel">
          <div className="panel-head">
            <p className="section-label">Tracked Sites</p>
            <h2>Статистика по сайтам</h2>
          </div>
          {loading ? (
            <p className="empty-copy">Загружаю SafeMind дашборд...</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Сайт</th>
                    <th>Время</th>
                    <th>Тревожность</th>
                    <th>Визиты</th>
                    <th>Тип</th>
                    <th>Лимит</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sites.map((site) => (
                    <tr key={site.site}>
                      <td>{site.site}</td>
                      <td>{secondsToLabel(site.time_spent)}</td>
                      <td>
                        <span className={`anxiety-pill ${anxietyTone(site.anxiety_level)}`}>{site.anxiety_level}%</span>
                      </td>
                      <td>{site.visits}</td>
                      <td>{site.content_type}</td>
                      <td>{site.recommended_limit ? secondsToLabel(site.recommended_limit) : 'Не задан'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default App;
