import { describe, expect, it } from 'vitest';
import { toPaisa } from './api';
describe('currency input to integer paisa', () => {
  it('converts decimal strings without floating point multiplication errors', () => {
    expect(toPaisa('300.50')).toBe(30050);
    expect(toPaisa('0.29')).toBe(29);
    expect(toPaisa('800')).toBe(80000);
  });
  it('rejects exponent notation, negative values and extra precision', () => {
    for (const value of ['1e4', '-1', '1.001', '', 'Infinity'])
      expect(() => toPaisa(value)).toThrow();
  });
});
