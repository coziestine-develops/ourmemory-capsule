import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ErrorScreen } from './components/common/ErrorScreen';
import { SetupNotice } from './components/common/SetupNotice';
import { supabaseConfigured } from './lib/supabase';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

const root = document.getElementById('root')!;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorScreen>
      {supabaseConfigured ? (
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      ) : (
        <SetupNotice />
      )}
    </ErrorScreen>
  </React.StrictMode>,
);
