import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './NavigationBar.css';

const NavigationBar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <h1>SafeMind</h1>
          <span className="navbar-subtitle">Digital Wellbeing</span>
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
            <div className="auth-links">
              <button 
                className="nav-btn"
                onClick={() => navigate('/login')}
              >
                Войти
              </button>
              <button 
                className="nav-btn primary"
                onClick={() => navigate('/register')}
              >
                Регистрация
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default NavigationBar;