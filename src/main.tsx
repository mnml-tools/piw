import { isTauri } from '@tauri-apps/api/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './app/Root';
import { currentWindowKind } from './app/window-kind';
import './styles/tokens.css';
import './styles/base.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

// UI development in a plain browser: serve the UI from an in-memory mock backend.
// `import.meta.env.DEV` is false in `vite build`, so the mock is never bundled.
if (import.meta.env.DEV && !isTauri()) {
  const { installMockBackend } = await import('./dev/install');
  installMockBackend();
}

const kind = currentWindowKind();
document.documentElement.dataset.window = kind.kind;

createRoot(container).render(
  <StrictMode>
    <Root kind={kind} />
  </StrictMode>,
);
