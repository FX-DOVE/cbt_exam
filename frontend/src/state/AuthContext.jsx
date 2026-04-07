import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthToken } from '../api/client';

const AuthContext = createContext(null);
const STORAGE_KEY = 'cbt_auth_v1';

export function AuthProvider({ children }) {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setReady(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.token && parsed.user) {
        setToken(parsed.token);
        setUser(parsed.user);
        setAuthToken(parsed.token);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setReady(true);
    }
  }, []);

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.token);
    setUser(data.user);
    setAuthToken(data.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: data.token, user: data.user }));
    return data.user;
  }

  function logout() {
    setToken('');
    setUser(null);
    setAuthToken('');
    localStorage.removeItem(STORAGE_KEY);
  }

  const value = useMemo(() => ({ token, user, ready, login, logout, setUser }), [token, user, ready]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used in AuthProvider');
  return ctx;
}

