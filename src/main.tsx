import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/theme.css';

const CHUNK_RELOAD_KEY = 'go-chunk-reload';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') {
    const root = document.getElementById('root');
    if (root && root.childElementCount === 0) {
      root.textContent = '頁面檔案已更新。請再重新整理一次。';
    }
    return;
  }
  sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  window.location.reload();
});

window.setTimeout(() => sessionStorage.removeItem(CHUNK_RELOAD_KEY), 15000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
