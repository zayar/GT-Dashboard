import { describe, expect, it } from 'vitest';
import { getCustomer360Images, isCustomer360Image } from './customer360Media';

const attachment = (overrides: Partial<Parameters<typeof isCustomer360Image>[0]> = {}) => ({
  id: 'file-1',
  name: 'file',
  kind: 'DOCUMENT',
  url: 'https://example.com/file',
  ...overrides,
});

describe('customer 360 media', () => {
  it('recognizes image MIME types and photo records', () => {
    expect(isCustomer360Image(attachment({ mimeType: 'image/png' }))).toBe(true);
    expect(isCustomer360Image(attachment({ kind: 'PHOTO' }))).toBe(true);
  });

  it('recognizes image extensions before signed URL query parameters', () => {
    expect(isCustomer360Image(attachment({
      url: 'https://storage.example.com/before_image_1.jpg?alt=media&token=secret',
    }))).toBe(true);
  });

  it('keeps PDFs and other documents out of the image viewer', () => {
    const pdf = attachment({ name: 'consent.pdf', mimeType: 'application/pdf', url: 'https://example.com/consent.pdf' });
    expect(isCustomer360Image(pdf)).toBe(false);
    expect(getCustomer360Images([pdf])).toEqual([]);
  });
});
