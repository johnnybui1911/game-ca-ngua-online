import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { SessionProvider } from './auth/session-context';
import { sound } from './audio/sound';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
sound.install();

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
