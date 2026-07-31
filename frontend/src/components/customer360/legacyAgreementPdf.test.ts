import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { composeLegacyImageAgreementPdf } from './legacyAgreementPdf';

const PNG_BYTES = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lBldVwAAAABJRU5ErkJggg==',
), (character) => character.charCodeAt(0));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('legacy image agreement PDF fallback', () => {
  it('creates a one-page PDF from Firebase-hosted consent and signature images', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(PNG_BYTES, {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }));

    const result = await composeLegacyImageAgreementPdf({
      documentUrl: 'https://firebasestorage.googleapis.com/v0/b/example/o/consent.png?alt=media',
      signatureUrl: 'https://firebasestorage.googleapis.com/v0/b/example/o/signature.png?alt=media',
      signatureAlign: 'left',
      signedAt: '2026-07-22T03:52:34.332Z',
    });

    expect(result.type).toBe('application/pdf');
    const pdf = await PDFDocument.load(await result.arrayBuffer());
    expect(pdf.getPageCount()).toBe(1);
  });

  it('rejects non-Firebase source URLs', async () => {
    await expect(composeLegacyImageAgreementPdf({
      documentUrl: 'https://example.com/consent.png',
      signatureUrl: 'https://firebasestorage.googleapis.com/v0/b/example/o/signature.png?alt=media',
    })).rejects.toThrow('approved Firebase Storage');
  });
});
