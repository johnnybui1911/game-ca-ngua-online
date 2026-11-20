import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DevApp from './DevApp';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <DevApp />
  </StrictMode>,
);
