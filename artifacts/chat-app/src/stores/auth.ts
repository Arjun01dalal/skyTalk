import { create } from 'zustand';
import { setAuthTokenGetter } from '@workspace/api-client-react';

interface AuthState {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: localStorage.getItem('accessToken'),
  setAccessToken: (token) => {
    if (token) {
      localStorage.setItem('accessToken', token);
    } else {
      localStorage.removeItem('accessToken');
    }
    set({ accessToken: token });
  },
}));

setAuthTokenGetter(() => useAuthStore.getState().accessToken);
