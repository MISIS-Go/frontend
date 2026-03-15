# SafeMind API Documentation

Все backend-эндпоинты отдаются Go-сервисом. Auth основан на JWT Bearer token.

## Auth

### `POST /api/auth/register`
**Описание**: создает пользователя и сразу выдает access token.

### Запрос
```json
{
  "email": "user@example.com",
  "password": "strong-password",
  "display_name": "SafeMind User"
}
```

### Ответ
```json
{
  "token": "<jwt>",
  "user": {
    "id": "usr_xxxxx",
    "email": "user@example.com",
    "display_name": "SafeMind User"
  }
}
```

### `POST /api/auth/login`
**Описание**: логин по email и password, возвращает новый access token.

### Запрос
```json
{
  "email": "user@example.com",
  "password": "strong-password"
}
```

### Ответ
Возвращает тот же формат, что и `POST /api/auth/register`.

### `GET /api/auth/me`
**Описание**: возвращает текущего пользователя по JWT.

### Заголовки
```http
Authorization: Bearer <jwt>
```

### Ответ
```json
{
  "id": "usr_xxxxx",
  "email": "user@example.com",
  "display_name": "SafeMind User"
}
```

## Authorization

Для бизнес-эндпоинтов можно передавать:
```http
Authorization: Bearer <jwt>
```

Если токен передан, backend берет `user_id` из токена и игнорирует `user_id` из body/query.  
Если токен не передан, для обратной совместимости backend все еще принимает `user_id` из запроса.

## ML Integration

Backend отправляет анализ сайта во внутренний ML endpoint:

### Internal call
`POST {ML_API_URL}/analyze-site`

### Payload sent to ML
```json
{
  "url": "https://news.example.com/article/123",
  "time_spent": 840
}
```

### ML response expected by backend
```json
{
  "anxiety_level": 78,
  "content_type": "news",
  "summary": "Контент выглядит эмоционально нагруженным, лучше сократить сессию и переключиться на более спокойный формат."
}
```

Важно: сейчас backend **не передает** в ML `user_id`, JWT, историю пользователя, лимиты или агрегаты.  
В ML уходят только:
- `url`
- `time_spent`

## 1. `POST /api/analyze-site`
**Описание**: принимает факт посещения сайта, отправляет его в ML для классификации тревожности и сохраняет визит в Postgres.

### Запрос
```json
{
  "user_id": "demo-user",
  "url": "https://news.example.com/article/123",
  "time_spent": 840
}
```

### Ответ
```json
{
  "user_id": "demo-user",
  "site": "news.example.com",
  "url": "https://news.example.com/article/123",
  "time_spent": 840,
  "anxiety_level": 78,
  "content_type": "news",
  "recommendation": "Вы провели слишком много времени на сайте. Пора сделать перерыв.",
  "summary": "Контент выглядит эмоционально нагруженным, лучше сократить сессию и переключиться на более спокойный формат."
}
```

### Поля ответа
- `site`: домен, извлеченный из URL.
- `anxiety_level`: уровень тревожности от `0` до `100`.
- `content_type`: тип контента, возвращенный ML.
- `recommendation`: рекомендация backend на основе тревожности, времени и лимита сайта.
- `summary`: текстовая оценка из ML.

## 2. `POST /api/time-prediction`
**Описание**: прогнозирует, сколько пользователь еще может провести на сайте, опираясь на историю визитов по домену.

### Запрос
```json
{
  "user_id": "demo-user",
  "url": "https://news.example.com/article/123"
}
```

### Ответ
```json
{
  "site": "news.example.com",
  "predicted_time": 1240,
  "average_time": 980,
  "recent_average_time": 1110,
  "anxiety_context": 74,
  "recommendation": "Пора сделать перерыв: прогнозируемое время выше заданного лимита.",
  "based_on_visits": 6,
  "configured_limit": 900
}
```

## 3. `POST /api/site-stats`
**Описание**: возвращает агрегированную статистику по посещенным сайтам и последние визиты для графиков.

### Запрос
```json
{
  "user_id": "demo-user"
}
```

### Ответ
```json
{
  "user_id": "demo-user",
  "sites": [
    {
      "site": "news.example.com",
      "time_spent": 2400,
      "anxiety_level": 76,
      "visits": 3,
      "content_type": "news",
      "recommended_limit": 900
    }
  ],
  "recent_visits": [
    {
      "site": "news.example.com",
      "time_spent": 840,
      "anxiety_level": 78,
      "visited_at": "2026-03-15T11:20:03Z"
    }
  ],
  "totals": {
    "total_time_spent": 2400,
    "average_anxiety_level": 76,
    "tracked_sites": 1,
    "alerting_sites": 1
  }
}
```

## 4. `POST /api/general-analysis`
**Описание**: строит общий прогноз тревожности на основе поведения пользователя по всем визитам.

### Запрос
```json
{
  "user_id": "demo-user"
}
```

### Ответ
```json
{
  "user_id": "demo-user",
  "total_anxiety_level": 68,
  "total_time_spent": 5200,
  "tracked_visits": 9,
  "focus_sites": [
    {
      "site": "news.example.com",
      "time_spent": 2400,
      "anxiety_level": 76,
      "visits": 3,
      "content_type": "news",
      "recommended_limit": 900
    }
  ],
  "recommendation": "Снизьте долю новостного и социального контента, добавьте спокойный информационный блок или перерыв без экрана.",
  "wellbeing_score": 29
}
```

## 5. `GET /api/settings`
**Описание**: получает персональные настройки SafeMind.

### Опциональный query
```text
user_id=demo-user
```

### Ответ
```json
{
  "user_id": "demo-user",
  "notification_frequency_minutes": 30,
  "moodboard": "sunrise",
  "site_limits": [
    {
      "site": "news.example.com",
      "time_limit_seconds": 900
    },
    {
      "site": "x.com",
      "time_limit_seconds": 1200
    }
  ]
}
```

## 6. `PUT /api/settings`
**Описание**: сохраняет лимиты по сайтам, частоту уведомлений и moodboard.

### Запрос
```json
{
  "user_id": "demo-user",
  "notification_frequency_minutes": 20,
  "moodboard": "forest",
  "site_limits": [
    {
      "site": "news.example.com",
      "time_limit_seconds": 600
    },
    {
      "site": "x.com",
      "time_limit_seconds": 900
    }
  ]
}
```

### Ответ
Возвращает сохраненный объект настроек в том же формате, что и `GET /api/settings`.

## Service Endpoints

### `GET /healthz`
Проверка backend и подключения к Postgres.

### Ответ
```json
{
  "service": "backend",
  "status": "ok",
  "uptime_checked": "2026-03-15T12:00:00Z"
}
```

### `GET /metrics`
Prometheus-метрики Go backend.
