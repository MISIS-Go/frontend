import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './RegisterForm.css';

const RegisterForm = ({ onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const { register, loading, error, clearError } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    
    if (!email || !password) {
      return;
    }

    await register(email, password, displayName);
  };

  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) {
      errors.push('Пароль должен содержать не менее 8 символов');
    }
    if (!/(?=.*[a-z])/.test(password)) {
      errors.push('Пароль должен содержать хотя бы одну строчную букву');
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push('Пароль должен содержать хотя бы одну заглавную букву');
    }
    if (!/(?=.*\d)/.test(password)) {
      errors.push('Пароль должен содержать хотя бы одну цифру');
    }
    return errors;
  };

  const passwordErrors = validatePassword(password);

  return (
    <div className="auth-form-container">
      <div className="auth-form-card">
        <div className="auth-form-header">
          <h2>Создайте аккаунт</h2>
          <p>Начните использовать SafeMind уже сегодня</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={clearError}
              placeholder="Введите ваш email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="displayName">Имя (необязательно)</label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onFocus={clearError}
              placeholder="Как к вам обращаться?"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Пароль</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={clearError}
              placeholder="Введите надежный пароль"
              required
            />
            {password && (
              <div className={`password-hint ${passwordErrors.length === 0 ? 'valid' : 'invalid'}`}>
                {passwordErrors.length === 0 ? (
                  <span className="valid-text">✓ Пароль надежный</span>
                ) : (
                  <div className="error-list">
                    {passwordErrors.map((error, index) => (
                      <span key={index} className="error-item">✗ {error}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button 
            type="submit" 
            className="auth-submit-btn"
            disabled={loading || passwordErrors.length > 0}
          >
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>

          <div className="auth-switch">
            <span>Уже есть аккаунт? </span>
            <button 
              type="button" 
              className="switch-link"
              onClick={onSwitchToLogin}
            >
              Войти
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterForm;