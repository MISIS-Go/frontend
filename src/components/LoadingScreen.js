import React from 'react';
import './LoadingScreen.css';

const LoadingScreen = ({ message = 'Загрузка...' }) => {
  return (
    <div className="loading-screen">
      <div className="loading-spinner"></div>
      <p>{message}</p>
    </div>
  );
};

export default LoadingScreen;