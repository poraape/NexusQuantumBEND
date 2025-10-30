import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { apiClient, setAuthToken as setApiClientAuthToken } from '../services/apiClient';

interface AuthContextType {
  token: string | null;
  login: (password: string, username?: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('authToken'));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      setApiClientAuthToken(token);
    } else {
      setApiClientAuthToken(null);
    }
  }, [token]);

  const login = async (password: string, username?: string) => {
    try {
      setError(null);
      const { access_token } = await apiClient.login(username || 'testuser', password);
      setToken(access_token);
      localStorage.setItem('authToken', access_token);
    } catch (err: any) {
      setError(err.message || 'Falha no login. Verifique suas credenciais.');
      console.error(err);
    }
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('authToken');
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
