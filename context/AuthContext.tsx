import React, { createContext, useContext, useEffect, useState } from 'react';
import { decodeToken } from '../services/tokenService';

type AuthContextType = {
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  userInfo: any;
};

const AuthContext = createContext<AuthContextType | null>(null);

// Helper: import dinámico de AsyncStorage (cached)
let cachedAsyncStorage: any = null;
const getAsyncStorage = async () => {
  if (cachedAsyncStorage) return cachedAsyncStorage;
  const mod = await import('@react-native-async-storage/async-storage');
  cachedAsyncStorage = mod.default ?? mod;
  return cachedAsyncStorage;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);

  useEffect(() => {
    // Evitar ejecutar en SSR / build
    if (typeof window === 'undefined') {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const checkToken = async () => {
      try {
        const AsyncStorage = await getAsyncStorage();

        const token = await AsyncStorage.getItem('token');
        if (token) {
          const decoded = decodeToken(token);
          const currentTime = Math.floor(Date.now() / 1000); // tiempo actual en segundos
          const tokenExp = Number(decoded?.exp);

          if (tokenExp && tokenExp < currentTime) {
            // Token expirado -> limpiamos storage y estado
            try {
              const allKeys = await AsyncStorage.getAllKeys();
              const allData = await AsyncStorage.multiGet(allKeys);
              // console.log('Contenido de AsyncStorage (expirado):', allData);
            } catch (err) {
              // No crítico: seguir
            }
            await AsyncStorage.removeItem('token');
            await AsyncStorage.removeItem('perfil');
            if (mounted) {
              setIsLoggedIn(false);
              setUserInfo(null);
            }
          } else {
            // Token válido
            if (mounted) {
              setUserInfo(decoded);
              setIsLoggedIn(true);
            }
          }
        } else {
          // no token
          if (mounted) {
            setIsLoggedIn(false);
            setUserInfo(null);
          }
        }
      } catch (err) {
        console.error('Error leyendo AsyncStorage en AuthContext:', err);
        if (mounted) {
          setIsLoggedIn(false);
          setUserInfo(null);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    checkToken();

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (token: string) => {
    if (typeof window === 'undefined') return; // no ejecutar en SSR
    try {
      const AsyncStorage = await getAsyncStorage();
      const tokenDecode = decodeToken(token);

      if (tokenDecode) {
        // Guardar token
        await AsyncStorage.setItem('token', token);
        setUserInfo(tokenDecode);

        const perfil = tokenDecode.perfil;
        if (typeof perfil === 'string' && perfil.trim() !== '') {
          await AsyncStorage.setItem('perfil', perfil);
        } else {
          console.warn('Perfil no definido o vacío, no se guarda en AsyncStorage');
        }

        setIsLoggedIn(true);
      }
    } catch (err) {
      console.error('Error en login AuthContext:', err);
    }
  };

  const logout = async () => {
    if (typeof window === 'undefined') {
      // si por alguna razón se llama en SSR, solo limpiamos estado
      setUserInfo(null);
      setIsLoggedIn(false);
      return;
    }
    try {
      const AsyncStorage = await getAsyncStorage();
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('perfil');
    } catch (err) {
      console.error('Error limpiando AsyncStorage en logout:', err);
    } finally {
      setUserInfo(null);
      setIsLoggedIn(false);
    }
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, logout, isLoading, userInfo }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
};
