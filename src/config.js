// Конфигурация API
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// Конфигурация JWT
export const JWT_CONFIG = {
  // Время жизни токена в миллисекундах (24 часа)
  TOKEN_LIFETIME: 24 * 60 * 60 * 1000,
  // Время до обновления токена в миллисекундах (30 минут)
  REFRESH_THRESHOLD: 30 * 60 * 1000,
};