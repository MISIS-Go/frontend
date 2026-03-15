import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingScreen from './LoadingScreen';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Пока идет проверка аутентификации, показываем загрузку
  if (loading) {
    return <LoadingScreen message="Проверка аутентификации..." />;
  }

  // Если пользователь не авторизован, перенаправляем на страницу входа
  if (!isAuthenticated) {
    // Сохраняем текущий путь, чтобы можно было вернуться после входа
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Если пользователь авторизован, показываем защищенный контент
  return children;
};

export default ProtectedRoute;
