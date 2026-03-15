import React, { useState, useEffect } from 'react';
import './Dashboard.css';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Здесь можно загрузить данные пользователя
    const timer = setTimeout(() => {
      setUser({
        name: 'Иван Иванов',
        email: 'ivan@example.com',
        lastLogin: 'Сегодня, 10:30'
      });
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Загрузка дашборда...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Добро пожаловать, {user.name}!</h1>
        <p>Последний вход: {user.lastLogin}</p>
      </div>
      
      <div className="dashboard-content">
        <div className="dashboard-card">
          <h3>Статистика</h3>
          <p>Ваши персональные метрики</p>
        </div>
        
        <div className="dashboard-card">
          <h3>Настройки</h3>
          <p>Управление профилем и уведомлениями</p>
        </div>
        
        <div className="dashboard-card">
          <h3>Аналитика</h3>
          <p>Подробная статистика по использованию</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;