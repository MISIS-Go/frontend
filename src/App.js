import './App.css';
import { lazy, startTransition, Suspense, useCallback, useEffect, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import NavigationBar from './components/NavigationBar';
import { useAuth } from './contexts/AuthContext';
import { authService } from './services/authService';
const DashboardSections = lazy(() => import('./components/DashboardSections'));

const moodboards = [
  { id: 'aqua-haze', title: 'Акварельная дымка', theme: 'aqua-haze', visual: 'aqua-haze' },
  { id: 'retro-future', title: 'Ретро футуризм', theme: 'retro-future', visual: 'retro-future' },
  { id: 'rain-garden', title: 'Меланхоличный ливень', theme: 'rain-garden', visual: 'rain-garden' },
  { id: 'cat-day', title: 'Кошачий день', theme: 'cat-day', visual: 'cat-day' },
  { id: 'cosmic-trip', title: 'Космическая одиссея', theme: 'cosmic-trip', visual: 'cosmic-trip' },
  { id: 'botanic-dream', title: 'Ботанический сон', theme: 'botanic-dream', visual: 'botanic-dream' },
];

const defaultSettings = {
  user_id: 'demo-user',
  notification_frequency_minutes: 30,
  moodboard: 'retro-future',
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

  return (
    <>
      <NavigationBar />
      <main className="app-shell">
        <section className="hero">
          <div className="hero-copy">
            <h1>
              <span className="hero-line hero-line-wide">Интерфейс цифровой гигиены для людей, которым важно,</span>
              <span className="hero-line">что делает с ними контент.</span>
            </h1>
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
          </div>

          <section className="moodboard-showcase" id="moodboard">
            <div className="panel-head center">
              <p className="section-label">Выберите свою тему</p>
              <h2>Выберите свою тему</h2>
            </div>
            <div className="moodboard-gallery">
              {moodboards.map((moodboard) => (
                <button
                  type="button"
                  key={moodboard.id}
                  className={`theme-object ${settings.moodboard === moodboard.theme ? 'is-active' : ''}`}
                  onClick={() => setSettings((current) => ({ ...current, moodboard: moodboard.theme }))}
                >
                  <span className={`theme-object-visual theme-${moodboard.visual}`} />
                  <strong>{moodboard.title}</strong>
                </button>
              ))}
            </div>
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

        <ErrorBoundary
          fallback={
            <section className="panel table-panel">
              <div className="panel-head">
                <p className="section-label">SafeMind</p>
                <h2>Главная страница загружена, но аналитический модуль ниже недоступен</h2>
              </div>
              <p className="summary-copy">
                Верхняя часть страницы и основной контент работают. Проблема локализована в модуле аналитики и больше не скрывает весь экран.
              </p>
            </section>
          }
        >
          <Suspense
            fallback={
              <section className="panel table-panel">
                <div className="panel-head">
                  <p className="section-label">SafeMind</p>
                  <h2>Загружаю аналитику</h2>
                </div>
                <p className="summary-copy">Главная страница уже доступна. Виджеты и графики подключаются отдельно.</p>
              </section>
            }
          >
            <DashboardSections
              redirectMessage={redirectMessage}
              setRedirectMessage={setRedirectMessage}
              error={error}
              general={general}
              stats={stats}
              loading={loading}
              siteForm={siteForm}
              setSiteForm={setSiteForm}
              handleAnalyzeSubmit={handleAnalyzeSubmit}
              analysis={analysis}
              prediction={prediction}
              secondsToLabel={secondsToLabel}
              settings={settings}
              setSettings={setSettings}
              limitDraft={limitDraft}
              setLimitDraft={setLimitDraft}
              addLimitDraft={addLimitDraft}
              removeLimit={removeLimit}
              savingSettings={savingSettings}
              handleSaveSettings={handleSaveSettings}
              moodboards={moodboards}
            />
          </Suspense>
        </ErrorBoundary>
      </main>
    </>
  );
}

export default App;
