import { describe, expect, it } from 'vitest';
import { buildMonthlyLifecycleCtes } from './ServiceDetails';

describe('buildMonthlyLifecycleCtes', () => {
  it('groups and filters lifecycle orders in Myanmar local time', () => {
    const query = buildMonthlyLifecycleCtes(
      'Botox (Korea) 1 Unit',
      'gtdenovo',
      'clinic-id',
      2026,
    );

    const localOrderDate = "DATETIME(TIMESTAMP(o.created_at), 'Asia/Yangon')";
    const localActivityDate = "DATETIME(TIMESTAMP(created_at), 'Asia/Yangon')";

    expect(query).toContain(`YEAR FROM ${localOrderDate}`);
    expect(query).toContain(`'%Y-%m',\n        ${localActivityDate}`);
    expect(query).not.toContain('EXTRACT(YEAR FROM o.created_at)');
  });
});
