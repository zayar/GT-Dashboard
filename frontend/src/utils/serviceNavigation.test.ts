import { describe, expect, it } from 'vitest';
import { getServiceDetailsPath } from './serviceNavigation';

describe('service navigation', () => {
  it('builds a service details path', () => {
    expect(getServiceDetailsPath('Shaving Charges')).toBe('/services/Shaving%20Charges');
  });

  it('keeps slashes and special characters inside the service route parameter', () => {
    expect(getServiceDetailsPath('Face / Neck & Jaw')).toBe('/services/Face%20%2F%20Neck%20%26%20Jaw');
  });
});
