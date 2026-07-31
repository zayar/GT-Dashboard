import { describe, expect, it } from 'vitest';
import type { Customer360Event } from './Customer360Panel';
import {
  curateCustomer360Events,
  isBusinessRelevantCustomerEvent,
  isConsultationNoteEvent,
  isCustomerVisibleAttachment,
  isFinalizedAgreementPdfUrl,
  isSignedAgreementEvent,
  withCustomerVisibleAttachments,
} from './customer360Presentation';

const event = (overrides: Partial<Customer360Event>): Customer360Event => ({
  id: 'event-1',
  type: 'INTERNAL_NOTE',
  title: 'Internal note added',
  description: 'Customer prefers an evening follow-up.',
  sourceLabel: 'TaskFlow internal note',
  sourceEntity: 'commentActivities',
  sourceId: 'source-1',
  attachments: [],
  ...overrides,
});

describe('Customer 360 presentation filtering', () => {
  it('hides raw TaskFlow audit activity', () => {
    expect(isBusinessRelevantCustomerEvent(event({ type: 'TASKFLOW_ACTIVITY', title: 'TaskFlow CREATE' }))).toBe(false);
  });

  it('hides exact TaskFlow synchronization marker notes', () => {
    expect(isBusinessRelevantCustomerEvent(event({ description: 'Sent to TaskFlow' }))).toBe(false);
    expect(isBusinessRelevantCustomerEvent(event({ description: ' sent-to-task-flow ' }))).toBe(false);
  });

  it('keeps staff-authored notes and care records', () => {
    const records = [
      event({ id: 'note', description: 'Call the customer tomorrow.' }),
      event({ id: 'procedure', type: 'PROCEDURE', title: 'Procedure completed' }),
    ];
    expect(curateCustomer360Events(records).map((record) => record.id)).toEqual(['note', 'procedure']);
  });

  it('groups all TaskFlow medical document records as consultation notes', () => {
    expect(isConsultationNoteEvent(event({
      type: 'MEDICAL_RECORD',
      title: 'Consultation Note',
      sourceEntity: 'medical_records',
    }))).toBe(true);
    expect(isConsultationNoteEvent(event({
      type: 'MEDICAL_RECORD',
      title: 'Medical procedure',
      sourceEntity: 'medical_records',
    }))).toBe(true);
    expect(isConsultationNoteEvent(event({
      type: 'INTERNAL_NOTE',
      title: 'Consultation Note',
    }))).toBe(false);
    expect(isConsultationNoteEvent(event({
      type: 'PROCEDURE',
      title: 'Medical procedure',
    }))).toBe(false);
  });

  it('hides editable annotation JSON payloads but keeps user-facing previews', () => {
    const payload = {
      id: 'annotation',
      name: 'annotation_r12.json',
      mimeType: 'application/json',
      kind: 'DOCUMENT',
      url: 'https://example.com/annotation_r12.json',
    };
    const preview = {
      id: 'preview',
      name: 'consultation_preview_r12.png',
      mimeType: 'image/png',
      kind: 'PHOTO',
      url: 'https://example.com/consultation_preview_r12.png',
    };

    expect(isCustomerVisibleAttachment(payload)).toBe(false);
    expect(isCustomerVisibleAttachment({ ...payload, name: 'annotation.json' })).toBe(false);
    expect(isCustomerVisibleAttachment(preview)).toBe(true);
    expect(withCustomerVisibleAttachments(event({ attachments: [payload, preview] })).attachments)
      .toEqual([preview]);
  });

  it('keeps a synchronization marker when it carries an attachment', () => {
    expect(isBusinessRelevantCustomerEvent(event({
      description: 'Sent to TaskFlow',
      attachments: [{ id: 'file-1', name: 'consent.pdf', kind: 'PDF', url: 'https://example.com/consent.pdf' }],
    }))).toBe(true);
  });

  it('keeps only confirmed TaskFlow agreements with a saved signature', () => {
    const signed = event({
      id: 'signed',
      type: 'CONSENT',
      description: 'Signed agreement',
      sourceEntity: 'member_service_consent',
      agreementSignatureUrl: 'https://example.com/signature.png',
    });
    const unsigned = event({
      id: 'unsigned',
      type: 'CONSENT',
      description: 'Agreement not confirmed',
      sourceEntity: 'member_service_consent',
    });
    const rawSignature = event({
      id: 'raw-signature',
      type: 'CONSENT',
      sourceEntity: 'images',
      agreementSignatureUrl: 'https://example.com/signature.png',
    });

    expect(isSignedAgreementEvent(signed)).toBe(true);
    expect(isBusinessRelevantCustomerEvent(unsigned)).toBe(false);
    expect(isBusinessRelevantCustomerEvent(rawSignature)).toBe(false);
    expect(curateCustomer360Events([unsigned, signed, rawSignature]).map((record) => record.id)).toEqual(['signed']);
  });

  it('distinguishes finalized agreement PDFs from legacy signature images', () => {
    expect(isFinalizedAgreementPdfUrl(
      'https://firebasestorage.googleapis.com/v0/b/example/o/'
      + 'clinic%2Fmember%2Fsigned-consents%2Fv2%2Frequest.pdf?alt=media',
    )).toBe(true);
    expect(isFinalizedAgreementPdfUrl('https://example.com/signature.png')).toBe(false);
  });
});
