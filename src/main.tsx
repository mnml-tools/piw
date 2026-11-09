import { isTauri } from '@tauri-apps/api/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './app/Root';
import { applyAppearance } from './app/theme';
import { currentWindowKind } from './app/window-kind';
// The shared mnml-tools kit first (palette, accents, component styles), then Piw on top.
import '@mnml-tools/ui/tokens.css';
import '@mnml-tools/ui/components.css';
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
// The defaults until the settings load (the kit's tokens need a resolved theme).
applyAppearance({ theme: 'system', textSize: 'default' });

createRoot(container).render(
  <StrictMode>
    <Root kind={kind} />
  </StrictMode>,
);
