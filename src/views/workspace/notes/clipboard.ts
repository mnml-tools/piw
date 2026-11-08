/** Copies plain text; rejects when the clipboard is unavailable or the write is refused. */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    throw new Error('Clipboard unavailable');
  }
  await navigator.clipboard.writeText(text);
}
