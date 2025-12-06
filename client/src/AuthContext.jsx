// client/src/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { api, setAuthToken, clearAuthToken, getAuthToken,decodeJwt } from './api';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { username, role, firstLogin }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // decode minimal info from token
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
        const payload = decodeJwt(token);
        if (payload && payload.exp * 1000 > Date.now()) {
        setUser({
            username: payload.username,
            role: payload.role,
            firstLogin: payload.firstLogin
        });
        } else {
        clearAuthToken();
        }
    }
  }, []);

  async function login(username, password) {
    setLoading(true);
    setError('');
    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      setAuthToken(result.token);
      setUser({
        username,
        role: result.role,
        firstLogin: result.firstLogin
      });
      return result;
    } catch (e) {
      setError(e.message);
      clearAuthToken();
      setUser(null);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearAuthToken();
    setUser(null);
  }

  async function changePassword(currentPassword, newPassword) {
    const result = await api('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    // backend expects logout afterwards
    logout();
    return result;
  }

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    changePassword,
    setUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
