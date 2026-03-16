import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';

const AppRouter = () => (
  <AuthProvider>
    <App />
  </AuthProvider>
);

export default AppRouter;
