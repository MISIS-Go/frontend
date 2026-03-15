import { API_BASE_URL } from '../config';

async function parseResponse(response) {
  const raw = await response.text();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    if (!response.ok) {
      throw new Error(raw);
    }
    throw new Error('Backend returned a non-JSON response');
  }
}

class AuthService {
  constructor() {
    this.tokenKey = 'safemind_token';
    this.userKey = 'safemind_user';
  }

  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token, user) {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  clearToken() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

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

  isAuthenticated() {
    const token = this.getToken();
    return !!token;
  }

  async register(email, password, displayName) {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
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

    const data = await parseResponse(response);

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка регистрации');
    }

    this.setToken(data.token, data.user);
    return data;
  }

  async login(email, password) {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка входа');
    }

    this.setToken(data.token, data.user);
    return data;
  }

  async getMe() {
    const token = this.getToken();
    if (!token) {
      throw new Error('Токен не найден');
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка получения данных пользователя');
    }

    return data;
  }

  logout() {
    this.clearToken();
  }

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
