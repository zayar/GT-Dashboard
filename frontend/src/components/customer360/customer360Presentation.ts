import type { Customer360Event } from './Customer360Panel';

const normalizeText = (value?: string | null) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const TASKFLOW_SYNC_MARKERS = new Set([
  'sent to taskflow',
  'sent to task flow',
]);

export const isFinalizedAgreementPdfUrl = (value?: string | null): boolean => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const normalized = decodeURIComponent(parsed.pathname).toLowerCase();
    return normalized.endsWith('.pdf') || normalized.includes('/signed-consents/v2/');
  } catch {
    return false;
  }
};

export const isConsultationNoteEvent = (event: Customer360Event): boolean => (
  event.type === 'MEDICAL_RECORD'
);

const attachmentFileName = (attachment: Customer360Event['attachments'][number]): string => {
  const explicitName = String(attachment.name || '').trim();
  if (explicitName) return explicitName.split('/').pop() || explicitName;
  try {
    return decodeURIComponent(new URL(attachment.url).pathname).split('/').pop() || '';
  } catch {
    return attachment.url.split(/[?#]/, 1)[0].split('/').pop() || '';
  }
};

const ANNOTATION_PAYLOAD_FILE = /^annotation(?:[_-]r\d+)?\.json$/i;

export const isCustomerVisibleAttachment = (
  attachment: Customer360Event['attachments'][number],
): boolean => !ANNOTATION_PAYLOAD_FILE.test(attachmentFileName(attachment));

export const withCustomerVisibleAttachments = (event: Customer360Event): Customer360Event => {
  const attachments = event.attachments.filter(isCustomerVisibleAttachment);
  return attachments.length === event.attachments.length ? event : { ...event, attachments };
};

export const isSignedAgreementEvent = (event: Customer360Event): boolean => (
  event.type === 'CONSENT'
  && event.sourceEntity === 'member_service_consent'
  && normalizeText(event.description) === 'signed agreement'
  && Boolean(event.agreementSignatureUrl)
);

export const isBusinessRelevantCustomerEvent = (event: Customer360Event): boolean => {
  // TaskFlow audit records describe database actions (CREATE, UPDATE, etc.),
  // not customer care. Keep them in TaskFlow but omit them from the owner view.
  if (event.type === 'TASKFLOW_ACTIVITY') return false;

  // Consent templates, unsigned records and raw signature uploads are not
  // completed customer agreements. Show only confirmed TaskFlow agreements.
  if (event.type === 'CONSENT' && !isSignedAgreementEvent(event)) return false;

  // TaskFlow writes this exact comment as an integration marker. It is not a
  // staff-authored customer note unless it also contains an attachment.
  if (
    event.type === 'INTERNAL_NOTE'
    && event.attachments.length === 0
    && TASKFLOW_SYNC_MARKERS.has(normalizeText(event.description))
  ) {
    return false;
  }

  return true;
};

export const curateCustomer360Events = (events: Customer360Event[]): Customer360Event[] => (
  events.filter(isBusinessRelevantCustomerEvent)
);
