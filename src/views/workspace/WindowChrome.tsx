import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { detectPlatform } from '@/app/theme';
import { workspaceStrings as t } from '@/strings/workspace';
import styles from './WindowChrome.module.css';

/**
 * The main window has no system title bar: the top bar is the title bar. macOS keeps its native
 * traffic lights (overlay title bar, set in Rust); Linux and Windows get these controls. Linux
 * also needs resize edges, because an undecorated GTK window has none.
 */
const platform = detectPlatform();
const drawsWindowControls = isTauri() && platform !== 'macos';
const drawsResizeEdges = isTauri() && platform === 'linux';

/** Tracks the maximized state and mirrors it on <html data-maximized> (frame styling). */
function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    const window = getCurrentWindow();
    let alive = true;
    const sync = () =>
      void window.isMaximized().then((value) => {
        if (!alive) return;
        setMaximized(value);
        document.documentElement.toggleAttribute('data-maximized', value);
      });
    sync();
    const unlisten = window.onResized(sync);
    return () => {
      alive = false;
      void unlisten.then((stop) => stop());
    };
  }, []);
  return maximized;
}

/** Minimise, maximise and close, drawn as the kit's `WindowControls` (@mnml-tools/ui/tauri). */
export function WindowControls() {
  const maximized = useMaximized();
  if (!drawsWindowControls) return null;
  const window = getCurrentWindow();
  return (
    <div className="mnml-window-controls" role="group" aria-label={t.window.controls}>
      <button
        type="button"
        className="mnml-button"
        aria-label={t.window.minimize}
        title={t.window.minimize}
        onClick={() => void window.minimize()}
      >
        <Minus size={14} aria-hidden />
      </button>
      <button
        type="button"
        className="mnml-button"
        aria-label={maximized ? t.window.restore : t.window.maximize}
        title={maximized ? t.window.restore : t.window.maximize}
        onClick={() => void window.toggleMaximize()}
      >
        {maximized ? <Copy size={13} aria-hidden /> : <Square size={13} aria-hidden />}
      </button>
      <button
        type="button"
        className="mnml-button mnml-window-close"
        aria-label={t.window.close}
        title={t.window.close}
        // Same path as the window manager's close: hides to the tray or quits (Rust decides).
        onClick={() => void window.close()}
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}

type Edge =
  'North' | 'South' | 'East' | 'West' | 'NorthEast' | 'NorthWest' | 'SouthEast' | 'SouthWest';
const EDGES: Edge[] = [
  'North',
  'South',
  'East',
  'West',
  'NorthEast',
  'NorthWest',
  'SouthEast',
  'SouthWest',
];

/** Invisible resize handles on the window edges (Linux, not maximized). */
export function ResizeEdges() {
  const maximized = useMaximized();
  if (!drawsResizeEdges || maximized) return null;
  const window = getCurrentWindow();
  return (
    <div aria-hidden className={styles.edges}>
      {EDGES.map((edge) => (
        // Pointer-only affordance (aria-hidden): keyboard users resize with the window manager
        // (e.g. Alt+F8 on KDE), exactly as with a native frame.
        // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions
        <div
          key={edge}
          className={styles.edge}
          data-edge={edge}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            void window.startResizeDragging(edge);
          }}
        />
      ))}
    </div>
  );
}
