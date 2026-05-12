import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'jwt';

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken);

  const login = useCallback((jwt, remember = false) => {
    if (remember) {
      localStorage.setItem(TOKEN_KEY, jwt);
    } else {
      sessionStorage.setItem(TOKEN_KEY, jwt);
    }
    setToken(jwt);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('userMobile');
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
