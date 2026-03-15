import { API_BASE_URL } from '../config';

class AuthService {
  constructor() {
    this.tokenKey = 'safemind_token';
    this.userKey = 'safemind_user';
    this.refreshTimer = null;
  }

  // Получение токена из localStorage
  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  // Сохранение токена и пользователя
  setToken(token, user) {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
    this.scheduleTokenRefresh(token);
  }

  // Удаление токена и пользователя
  clearToken() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.clearRefreshTimer();
  }

  // Планирование обновления токена
  scheduleTokenRefresh(token) {
    this.clearRefreshTimer();
    
    try {
      // Декодируем JWT токен для получения времени истечения
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresAt = payload.exp * 1000; // Время в миллисекундах
      const now = Date.now();
      
      // Рассчитываем время до обновления (за 5 минут до истечения)
      const timeUntilRefresh = Math.max(0, expiresAt - now - 5 * 60 * 1000);
      
      if (timeUntilRefresh > 0) {
        this.refreshTimer = setTimeout(() => {
          this.refreshToken();
        }, timeUntilRefresh);
      }
    } catch (error) {
      console.warn('Не удалось запланировать обновление токена:', error);
    }
  }

  // Очистка таймера обновления
  clearRefreshTimer() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // Обновление токена (если backend поддерживает refresh токены)
  async refreshToken() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.getToken()}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.setToken(data.token, data.user);
      } else {
        // Если обновление не удалось, очищаем токен
        this.clearToken();
      }
    } catch (error) {
      console.warn('Ошибка обновления токена:', error);
      this.clearToken();
    }
  }

  // Получение пользователя из localStorage
  getUser() {
    const userStr = localStorage.getItem(this.userKey);
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // Проверка, авторизован ли пользователь
  isAuthenticated() {
    const token = this.getToken();
    return !!token;
  }

  // Регистрация пользователя
  async register(email, password, displayName) {
    const response = await fetch(`${API_BASE_URL}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        display_name: displayName || email,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка регистрации');
    }

    // Сохраняем токен и пользователя
    this.setToken(data.token, data.user);
    return data;
  }

  // Вход пользователя
  async login(email, password) {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка входа');
    }

    // Сохраняем токен и пользователя
    this.setToken(data.token, data.user);
    return data;
  }

  // Получение информации о текущем пользователе
  async getMe() {
    const token = this.getToken();
    if (!token) {
      throw new Error('Токен не найден');
    }

    const response = await fetch(`${API_BASE_URL}/api/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка получения данных пользователя');
    }

    return data;
  }

  // Выход пользователя
  logout() {
    this.clearToken();
  }

  // Обновление данных пользователя в localStorage
  updateUser(userData) {
    const user = this.getUser();
    if (user) {
      const updatedUser = { ...user, ...userData };
      localStorage.setItem(this.userKey, JSON.stringify(updatedUser));
      return updatedUser;
    }
    return null;
  }
}

export const authService = new AuthService();