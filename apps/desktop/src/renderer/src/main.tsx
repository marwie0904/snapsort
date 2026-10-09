import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ShelfWindow } from './components/ShelfWindow';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
  },
});

const isShelfView =
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).get('view') === 'shelf' ||
    window.location.hash.includes('shelf'));

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {isShelfView ? <ShelfWindow /> : <App />}
    </QueryClientProvider>
  </React.StrictMode>
);
