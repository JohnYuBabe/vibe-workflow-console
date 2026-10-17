import axios from 'axios';

export const TOKEN_KEY = 'vibe_console_token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);

      const base = import.meta.env.BASE_URL || '/';
      const loginPath = `${base.replace(/\/$/, '')}/login`;
      if (!window.location.pathname.endsWith('/login')) {
        window.location.assign(loginPath);
      }
    }

    return Promise.reject(error);
  },
);
