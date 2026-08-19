import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('catalog input contracts', () => {
  it('rejects negative prices', () => {
    const input = z.object({ sellingPrice: z.number().nonnegative() });
    expect(() => input.parse({ sellingPrice: -1 })).toThrow();
  });
});
