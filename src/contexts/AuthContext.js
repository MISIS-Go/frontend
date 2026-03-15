import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

// Создаем контекст аутентификации
const AuthContext = createContext();

// Хук для использования контекста аутентификации
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Провайдер аутентификации
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Проверка аутентификации при загрузке приложения
  useEffect(() => {
    checkAuth();
  }, []);

  // Проверка аутентификации
  const checkAuth = async () => {
    setLoading(true);
    setError('');
    
    try {
      const token = authService.getToken();
      if (token) {
        // Проверяем валидность токена, получая данные пользователя
        const userData = await authService.getMe();
        setUser(userData);
      }
    } catch (err) {
      // Если токен недействителен, очищаем его
      authService.clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Регистрация
  const register = async (email, password, displayName) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await authService.register(email, password, displayName);
      setUser(response.user);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  // Вход
  const login = async (email, password) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await authService.login(email, password);
      setUser(response.user);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  // Выход
  const logout = () => {
    authService.logout();
    setUser(null);
    setError('');
  };

  // Обновление пользователя
  const updateUser = (userData) => {
    const updatedUser = authService.updateUser(userData);
    setUser(updatedUser);
    return updatedUser;
  };

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    register,
    login,
    logout,
    updateUser,
    clearError: () => setError(''),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};