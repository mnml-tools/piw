/** Finds the element marked `data-<attribute>="<id>"` inside `container`, then `selector` in it. */
export function findIn<T extends Element>(
  container: HTMLElement | null,
  attribute: string,
  id: string,
  selector: string,
): T | null {
  for (const node of container?.querySelectorAll<HTMLElement>(`[data-${attribute}]`) ?? []) {
    if (node.getAttribute(`data-${attribute}`) === id) return node.querySelector<T>(selector);
  }
  return null;
}

/** The checkbox of the task row with `id` inside `container`. */
export function rowCheckbox(container: HTMLElement | null, id: string): HTMLInputElement | null {
  return findIn<HTMLInputElement>(container, 'task-id', id, 'input[type="checkbox"]');
}
