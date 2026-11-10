import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, json, setCsrf } from '../../lib/api';
import type { User } from '../../lib/types';
const Context = createContext<{
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  const cache = useQueryClient();
  async function refresh() {
    try {
      const data = await api<{ user: User; csrf: string }>('/auth/me');
      setUser(data.user);
      setCsrf(data.csrf);
    } catch {
      setUser(null);
      setCsrf('');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    function expired() {
      setUser(null);
      setCsrf('');
      cache.clear();
    }
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  async function login(email: string, password: string) {
    const d = await api<{ user: User; csrf: string }>('/auth/login', {
      method: 'POST',
      body: json({ email, password }),
    });
    cache.clear();
    setCsrf(d.csrf);
    setUser(d.user);
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setCsrf('');
    cache.clear();
  }
  return (
    <Context.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('Auth provider missing.');
  return value;
}
