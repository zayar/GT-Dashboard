import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 5 * 1024 * 1024;
const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const ALLOWED_STORAGE_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

interface LegacyImageAgreementInput {
  documentUrl: string;
  signatureUrl: string;
  signatureAlign?: string | null;
  signedAt?: string | null;
}

interface DownloadedAsset {
  bytes: Uint8Array;
  contentType: string;
}

const approvedStorageUrl = (value: string, label: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} has an invalid storage URL.`);
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_STORAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`${label} is not stored in an approved Firebase Storage location.`);
  }
  return parsed.toString();
};

const downloadAsset = async (url: string, label: string, maximumBytes: number): Promise<DownloadedAsset> => {
  const response = await fetch(approvedStorageUrl(url, label));
  if (!response.ok) throw new Error(`${label} could not be downloaded.`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maximumBytes) {
    throw new Error(`${label} is empty or too large.`);
  }
  return {
    bytes,
    contentType: String(response.headers.get('content-type') || '').toLowerCase(),
  };
};

const isPng = ({ bytes, contentType }: DownloadedAsset): boolean => (
  contentType.includes('png')
  || (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  )
);

const isJpeg = ({ bytes, contentType }: DownloadedAsset): boolean => (
  contentType.includes('jpeg')
  || contentType.includes('jpg')
  || (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
);

const formatSignedDate = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Yangon',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('day')} / ${byType.get('month')} / ${byType.get('year')}`;
};

const normalizedAlignment = (value?: string | null): 'left' | 'center' | 'right' => {
  const alignment = String(value || '').trim().toLowerCase();
  if (alignment === 'left' || alignment === 'center') return alignment;
  return 'right';
};

export const composeLegacyImageAgreementPdf = async ({
  documentUrl,
  signatureUrl,
  signatureAlign,
  signedAt,
}: LegacyImageAgreementInput): Promise<Blob> => {
  const [document, signature] = await Promise.all([
    downloadAsset(documentUrl, 'Original agreement', MAX_DOCUMENT_BYTES),
    downloadAsset(signatureUrl, 'Signature image', MAX_SIGNATURE_BYTES),
  ]);
  if (!isPng(document) && !isJpeg(document)) {
    throw new Error('The original agreement is not a supported JPG or PNG image.');
  }
  if (!isPng(signature) && !isJpeg(signature)) {
    throw new Error('The saved signature is not a supported image.');
  }

  const pdf = await PDFDocument.create();
  const documentImage = isPng(document)
    ? await pdf.embedPng(document.bytes)
    : await pdf.embedJpg(document.bytes);
  const isLandscape = documentImage.width > documentImage.height;
  const pageWidth = isLandscape ? A4_PORTRAIT.height : A4_PORTRAIT.width;
  const pageHeight = isLandscape ? A4_PORTRAIT.width : A4_PORTRAIT.height;
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(documentImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  const signatureImage = isPng(signature)
    ? await pdf.embedPng(signature.bytes)
    : await pdf.embedJpg(signature.bytes);
  const signatureScale = Math.min(
    (pageWidth * 0.3) / signatureImage.width,
    (pageHeight * 0.09) / signatureImage.height,
  );
  const signatureWidth = signatureImage.width * signatureScale;
  const signatureHeight = signatureImage.height * signatureScale;
  const alignment = normalizedAlignment(signatureAlign);
  const horizontalMargin = pageWidth * 0.03;
  const signatureX = alignment === 'left'
    ? pageWidth * 0.25
    : alignment === 'center'
      ? pageWidth * 0.4
      : pageWidth - signatureWidth - horizontalMargin;
  const signatureY = pageHeight * 0.028;
  page.drawImage(signatureImage, {
    x: signatureX,
    y: signatureY,
    width: signatureWidth,
    height: signatureHeight,
  });

  const dateText = formatSignedDate(signedAt);
  if (dateText) {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontSize = 10.5;
    const dateWidth = font.widthOfTextAtSize(dateText, fontSize);
    const dateX = alignment === 'right'
      ? pageWidth * 0.12
      : (pageWidth * 0.84) - (dateWidth / 2);
    page.drawText(dateText, {
      x: dateX,
      y: pageHeight * 0.062,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }

  pdf.setProducer('GreatTime Report');
  pdf.setTitle('Signed consent form');
  const bytes = await pdf.save({ useObjectStreams: false });
  return new Blob([bytes], { type: 'application/pdf' });
};
