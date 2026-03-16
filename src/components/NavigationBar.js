import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import './NavigationBar.css';

const NavigationBar = () => {
  const { user, logout } = useAuth();
  const navItems = [
    { label: 'О расширении', hash: 'extension' },
    { label: 'Практики', hash: 'analytics' },
    { label: 'Статистика', hash: 'analytics' },
    { label: 'Таймер', hash: 'break-room' },
    { label: 'Управление', hash: 'analytics' },
    { label: 'Профиль', hash: 'moodboard' },
  ];

  const handleLogout = () => {
    logout();
    window.location.hash = '';
  };

  return (
    <nav className="navbar">
      <div className={`navbar-container ${user ? 'has-user' : 'is-guest'}`}>
        <div className="navbar-brand">
          <h1>SafeMind</h1>
          <span className="navbar-subtitle">Digital Wellbeing</span>
        </div>

        <div className="navbar-links" aria-label="Навигация SafeMind">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className="navbar-link"
              onClick={() => {
                window.location.hash = item.hash;
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="navbar-user">
          {user ? (
            <>
              <div className="user-info">
                <span className="user-name">{user.display_name}</span>
                <span className="user-email">{user.email}</span>
              </div>
              <button 
                className="logout-btn"
                onClick={handleLogout}
              >
                Выйти
              </button>
            </>
          ) : (
            null
          )}
        </div>
      </div>
    </nav>
  );
};

export default NavigationBar;
