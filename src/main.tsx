import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerPwa } from './pwa';

registerPwa(() => window.dispatchEvent(new CustomEvent('terminus:pwa-update')));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
