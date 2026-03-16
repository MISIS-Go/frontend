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

function anxietyTone(value) {
  if (value >= 75) return 'high';
  if (value >= 55) return 'medium';
  return 'low';
}

export default function DashboardSections({
  redirectMessage,
  setRedirectMessage,
  error,
  general,
  stats,
  loading,
  siteForm,
  setSiteForm,
  handleAnalyzeSubmit,
  analysis,
  prediction,
  secondsToLabel,
  settings,
  setSettings,
  limitDraft,
  setLimitDraft,
  addLimitDraft,
  removeLimit,
  savingSettings,
  handleSaveSettings,
  moodboards,
}) {
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
            <button type="button" className="secondary-action" onClick={addLimitDraft}>
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
    </>
  );
}
