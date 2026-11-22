import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { recordVisit } from './analytics';
import { App } from './App';
import { SessionProvider } from './auth/session-context';
import { sound } from './audio/sound';
import { QualityProvider } from './scene/render/QualityProvider';
import './styles/index.css';

recordVisit();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
sound.install();

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        {/* Above the app shell, so pages can dim the board and read the quality tier. */}
        <QualityProvider>
          <App />
        </QualityProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
