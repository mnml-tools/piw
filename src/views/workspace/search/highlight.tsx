import type { ReactNode } from 'react';

const START = '\u0002';
const END = '\u0003';

/** Renders FTS5 snippet markers as <mark> without ever interpreting text as HTML. */
export function highlight(snippet: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = snippet;
  let key = 0;
  while (rest.length > 0) {
    const start = rest.indexOf(START);
    if (start === -1) {
      out.push(rest);
      break;
    }
    if (start > 0) out.push(rest.slice(0, start));
    const end = rest.indexOf(END, start + 1);
    const marked = end === -1 ? rest.slice(start + 1) : rest.slice(start + 1, end);
    out.push(<mark key={key++}>{marked}</mark>);
    rest = end === -1 ? '' : rest.slice(end + 1);
  }
  return out;
}
