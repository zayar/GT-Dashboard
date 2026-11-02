import { describe, expect, it } from 'vitest';
import { parseBigQueryArray } from './bigQueryResults';

describe('parseBigQueryArray', () => {
  it('treats empty BigQuery aggregates as empty history', () => {
    for (const value of [null, undefined, 'null', '[]']) {
      expect(parseBigQueryArray(value)).toEqual([]);
    }
  });

  it('preserves native and JSON history arrays', () => {
    const history = [{ service: 'Laser', count: 3 }];
    expect(parseBigQueryArray(history)).toEqual(history);
    expect(parseBigQueryArray(JSON.stringify(history))).toEqual(history);
  });

  it('keeps malformed JSON visible to the existing error handler', () => {
    expect(() => parseBigQueryArray('invalid')).toThrow();
  });
});
