export const workspaceStrings = {
  window: {
    controls: 'Window',
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close window',
  },
  /** The title bar and status bar (docs/ui-design-system.md, "Shell"). */
  topBar: {
    /** The title bar's brand, lower case like the other mnml-tools apps ("zap"). */
    brand: 'piw',
    appearance: 'Appearance',
    done: 'Done',
  },
  spaces: {
    name: 'Name',
    save: 'Save',
  },
  trayNotice: 'Piw keeps running in the tray. Use the tray menu to quit.',
  manyStickies: (n: number) =>
    `${n} stickies are open. Each one uses memory — hide the ones you don't need right now.`,
} as const;
