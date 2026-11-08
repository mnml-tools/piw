/** DOM ids shared by a tab and its panel (`aria-controls` / `aria-labelledby`). */
export function getTabIds(idBase: string, itemId: string): { tabId: string; panelId: string } {
  const safe = itemId.replace(/[^A-Za-z0-9_-]/g, '_');
  return { tabId: `${idBase}-tab-${safe}`, panelId: `${idBase}-panel-${safe}` };
}
