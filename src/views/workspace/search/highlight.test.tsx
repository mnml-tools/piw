import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { highlight } from './highlight';

describe('highlight', () => {
  it('wraps marked ranges in <mark> and keeps HTML as text', () => {
    const { container } = render(
      <p>{highlight('use \u00022FA\u0003 for <img src=x onerror=alert(1)>')}</p>,
    );
    expect(container.querySelector('mark')?.textContent).toBe('2FA');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('tolerates an unterminated marker', () => {
    const { container } = render(<p>{highlight('a \u0002b')}</p>);
    expect(container.querySelector('mark')?.textContent).toBe('b');
  });
});
