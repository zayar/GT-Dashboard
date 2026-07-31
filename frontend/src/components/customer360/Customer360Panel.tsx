import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Link,
  Paper,
  Skeleton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import MedicalServicesRoundedIcon from '@mui/icons-material/MedicalServicesRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import PhotoLibraryRoundedIcon from '@mui/icons-material/PhotoLibraryRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import StickyNote2RoundedIcon from '@mui/icons-material/StickyNote2Rounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import { useAuth } from '../../contexts/AuthContext';
import {
  curateCustomer360Events,
  isConsultationNoteEvent,
  isFinalizedAgreementPdfUrl,
  isSignedAgreementEvent,
  withCustomerVisibleAttachments,
} from './customer360Presentation';
import {
  formatCustomerDateTime,
  formatCustomerEventDate,
  formatProcedureDateTime,
} from './customer360Formatting';
import CustomerImageLightbox from './CustomerImageLightbox';
import { isCustomer360Image } from './customer360Media';
import { composeLegacyImageAgreementPdf } from './legacyAgreementPdf';

export interface Customer360Attachment {
  id: string;
  name: string;
  mimeType?: string | null;
  kind: string;
  url: string;
  sizeBytes?: number | null;
}

export interface Customer360Event {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  occurredAt?: string | null;
  actorName?: string | null;
  actorType?: string | null;
  serviceName?: string | null;
  serviceNames?: string[];
  practitionerNames?: string[];
  procedureMode?: 'BOOKING' | 'MANUAL' | string | null;
  agreementDocumentUrl?: string | null;
  agreementSignatureUrl?: string | null;
  agreementSignatureAlign?: string | null;
  agreementSignedAt?: string | null;
  bookingId?: string | null;
  checkinId?: string | null;
  sourceLabel: string;
  sourceEntity: string;
  sourceId: string;
  attachments: Customer360Attachment[];
}

export interface Customer360Data {
  memberId: string;
  totalBookingCount: number;
  scannedBookingCount: number;
  truncated: boolean;
  generatedAt: string;
  summary: {
    activityCount: number;
    noteCount: number;
    procedureCount: number;
    documentCount: number;
    photoCount: number;
    consentCount: number;
    latestActivityAt?: string | null;
  };
  events: Customer360Event[];
}

interface Customer360PanelProps {
  phoneNumber: string;
  clinicCode: string;
  customerName?: string;
}

interface Customer360PanelViewProps {
  data: Customer360Data;
  customerName?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  loadSignedAgreementPdf?: (event: Customer360Event) => Promise<Blob>;
}

type Customer360Tab = 'timeline' | 'consultations' | 'procedures' | 'notes' | 'agreements' | 'files';

const CUSTOMER360_API_BASE_URL = (import.meta.env.VITE_CUSTOMER360_API_BASE || '').replace(/\/+$/, '');
const PAGE_SIZE = 12;
const agreementDomId = (eventId: string) => `customer360-agreement-${encodeURIComponent(eventId)}`;

const QUERY = `query Customer360V1($clinicCode: String!, $phoneNumber: String!, $take: Int) {
  customer360V1(clinicCode: $clinicCode, phoneNumber: $phoneNumber, take: $take) {
    memberId
    totalBookingCount
    scannedBookingCount
    truncated
    generatedAt
    summary {
      activityCount
      noteCount
      procedureCount
      documentCount
      photoCount
      consentCount
      latestActivityAt
    }
    events {
      id
      type
      title
      description
      occurredAt
      actorName
      actorType
      serviceName
      serviceNames
      practitionerNames
      procedureMode
      agreementDocumentUrl
      agreementSignatureUrl
      agreementSignatureAlign
      agreementSignedAt
      bookingId
      checkinId
      sourceLabel
      sourceEntity
      sourceId
      attachments {
        id
        name
        mimeType
        kind
        url
        sizeBytes
      }
    }
  }
}`;

const formatFileSize = (size?: number | null) => {
  if (!size || size < 1) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const eventPresentation = (type: string) => {
  switch (type) {
    case 'INTERNAL_NOTE':
      return { label: 'Internal note', color: '#7C3AED', soft: '#F3EEFF', icon: <StickyNote2RoundedIcon fontSize="small" /> };
    case 'PROCEDURE':
    case 'MEDICAL_RECORD':
      return { label: type === 'PROCEDURE' ? 'Procedure' : 'Medical record', color: '#0F766E', soft: '#E8F7F4', icon: <MedicalServicesRoundedIcon fontSize="small" /> };
    case 'PHOTO':
      return { label: 'Treatment photo', color: '#2563EB', soft: '#EBF2FF', icon: <PhotoLibraryRoundedIcon fontSize="small" /> };
    case 'DOCUMENT':
      return { label: 'Document', color: '#B45309', soft: '#FFF6E5', icon: <DescriptionRoundedIcon fontSize="small" /> };
    case 'CONSENT':
      return { label: 'Consent', color: '#168260', soft: '#EAFBF4', icon: <AssignmentTurnedInRoundedIcon fontSize="small" /> };
    default:
      return { label: 'TaskFlow activity', color: '#475467', soft: '#F2F4F7', icon: <HistoryRoundedIcon fontSize="small" /> };
  }
};

const AttachmentLink: React.FC<{
  attachment: Customer360Attachment;
  compact?: boolean;
  onOpenImage?: (attachment: Customer360Attachment) => void;
}> = ({ attachment, compact, onOpenImage }) => {
  const isPhoto = isCustomer360Image(attachment);
  const content = (
    <>
      {isPhoto ? (
        <Box
          component="img"
          src={attachment.url}
          alt=""
          loading="lazy"
          sx={{ width: compact ? 34 : 48, height: compact ? 34 : 48, borderRadius: 1, objectFit: 'cover', bgcolor: 'var(--surface-secondary)', flexShrink: 0 }}
        />
      ) : (
        <Box sx={{ width: compact ? 34 : 48, height: compact ? 34 : 48, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: 'var(--surface-secondary)', color: 'var(--primary)', flexShrink: 0 }}>
          <AttachFileRoundedIcon fontSize="small" />
        </Box>
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: compact ? '0.74rem' : '0.8rem', fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'inherit' }}>
          {attachment.name}
        </Typography>
        <Typography sx={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
          {[attachment.kind.toLowerCase(), formatFileSize(attachment.sizeBytes)].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
      {isPhoto
        ? <PhotoLibraryRoundedIcon sx={{ fontSize: 16, color: 'var(--primary)', flexShrink: 0 }} />
        : <OpenInNewRoundedIcon sx={{ fontSize: 16, color: 'var(--text-muted)', flexShrink: 0 }} />}
    </>
  );

  const tileSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    minWidth: 0,
    width: '100%',
    p: compact ? 0.75 : 1,
    border: '1px solid var(--border)',
    borderRadius: 1.5,
    bgcolor: 'var(--surface)',
    color: 'var(--text-primary)',
    textAlign: 'left',
    font: 'inherit',
    cursor: 'pointer',
    '&:hover': { borderColor: 'var(--primary)', bgcolor: 'var(--primary-soft)' },
    '&:focus-visible': { outline: '3px solid color-mix(in srgb, var(--primary) 28%, transparent)', outlineOffset: 2 },
  } as const;

  if (isPhoto) {
    return (
      <Box
        component="button"
        type="button"
        onClick={() => onOpenImage?.(attachment)}
        aria-label={`Preview ${attachment.name}`}
        sx={tileSx}
      >
        {content}
      </Box>
    );
  }

  return (
    <Link href={attachment.url} target="_blank" rel="noopener noreferrer" underline="none" aria-label={`Open ${attachment.name}`} sx={tileSx}>
      {content}
    </Link>
  );
};

const EventRow: React.FC<{
  event: Customer360Event;
  onOpenAgreement?: (event: Customer360Event) => void;
  onOpenImage?: (attachment: Customer360Attachment) => void;
}> = ({ event, onOpenAgreement, onOpenImage }) => {
  const date = formatCustomerEventDate(event.occurredAt);
  const presentation = eventPresentation(event.type);
  const isInternalNote = event.type === 'INTERNAL_NOTE';
  const isSignedAgreement = isSignedAgreementEvent(event);
  const services = event.serviceNames?.length
    ? event.serviceNames
    : event.serviceName
      ? [event.serviceName]
      : [];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '54px 1fr', sm: '70px 1fr' }, gap: { xs: 1, sm: 1.5 }, position: 'relative' }}>
      <Box sx={{ textAlign: 'center', pt: 0.25 }}>
        <Typography sx={{ fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.05 }}>{date.day}</Typography>
        <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{date.month}</Typography>
        {date.time && (
          <>
            <Typography sx={{ mt: 0.2, fontSize: '0.62rem', color: 'var(--text-muted)' }}>{date.time}</Typography>
            <Typography sx={{ fontSize: '0.56rem', color: 'var(--text-muted)' }}>Yangon</Typography>
          </>
        )}
      </Box>
      <Box sx={{ position: 'relative', pb: 2.25, pl: { xs: 2.5, sm: 3 } }}>
        <Box sx={{ position: 'absolute', left: 0, top: 1, bottom: 0, width: 2, bgcolor: 'var(--border)' }} />
        <Box sx={{ position: 'absolute', left: -14, top: 0, width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: presentation.soft, color: presentation.color, border: '3px solid var(--surface)' }}>
          {presentation.icon}
        </Box>
        <Paper
          elevation={0}
          role={isSignedAgreement ? 'button' : undefined}
          tabIndex={isSignedAgreement ? 0 : undefined}
          aria-label={isSignedAgreement ? `View and print ${event.title}` : undefined}
          onClick={isSignedAgreement ? () => onOpenAgreement?.(event) : undefined}
          onKeyDown={isSignedAgreement ? (keyboardEvent) => {
            if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
              keyboardEvent.preventDefault();
              onOpenAgreement?.(event);
            }
          } : undefined}
          sx={{
            p: { xs: 1.5, sm: 2 },
            border: '1px solid var(--border)',
            borderRadius: 2,
            bgcolor: 'var(--surface)',
            ...(isSignedAgreement && {
              width: '100%',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color 140ms ease, background-color 140ms ease, transform 140ms ease',
              '&:hover': {
                borderColor: '#168260',
                bgcolor: 'color-mix(in srgb, #168260 4%, var(--surface))',
                transform: 'translateY(-1px)',
              },
              '&:focus-visible': {
                outline: '3px solid color-mix(in srgb, #168260 30%, transparent)',
                outlineOffset: 2,
              },
            }),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.92rem', fontWeight: 720, color: 'var(--text-primary)' }}>{event.title}</Typography>
              <Typography sx={{ mt: 0.2, fontSize: '0.7rem', color: presentation.color, fontWeight: 650 }}>{isSignedAgreement ? 'Signed agreement' : presentation.label}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{event.sourceLabel}</Typography>
          </Box>
          {event.description && !isSignedAgreement && (
            <Typography
              sx={{
                mt: 1,
                pl: isInternalNote ? 1.25 : 0,
                py: isInternalNote ? 0.4 : 0,
                borderLeft: isInternalNote ? '3px solid #7C3AED' : 0,
                fontSize: isInternalNote ? { xs: '0.96rem', sm: '1.02rem' } : '0.84rem',
                fontWeight: isInternalNote ? 620 : 400,
                lineHeight: 1.65,
                letterSpacing: isInternalNote ? '0.005em' : 0,
                color: isInternalNote ? 'var(--text-primary)' : 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {event.description}
            </Typography>
          )}
          {(services.length > 0 || event.actorName) && (
            <Box sx={{ mt: 1.25, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {services.map((service) => <Chip key={service} size="small" label={service} sx={{ height: 24, fontSize: '0.68rem', bgcolor: 'var(--primary-soft)', color: 'var(--primary)' }} />)}
              {event.actorName && <Chip size="small" variant="outlined" label={`By ${event.actorName}`} sx={{ height: 24, fontSize: '0.68rem', borderColor: 'var(--border)', color: 'var(--text-secondary)' }} />}
            </Box>
          )}
          {isSignedAgreement && (
            <Box sx={{ mt: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                size="small"
                label="Signed in TaskFlow"
                sx={{ height: 24, fontSize: '0.68rem', fontWeight: 680, bgcolor: '#EAFBF4', color: '#168260' }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35, color: '#168260' }}>
                <Typography sx={{ fontSize: '0.74rem', fontWeight: 720 }}>View & print</Typography>
                <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />
              </Box>
            </Box>
          )}
          {event.attachments.length > 0 && !isSignedAgreement && (
            <Box sx={{ mt: 1.25, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 0.75 }}>
              {event.attachments.slice(0, 4).map((attachment) => <AttachmentLink key={attachment.id} attachment={attachment} compact onOpenImage={onOpenImage} />)}
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
};

const ProcedureCard: React.FC<{ event: Customer360Event; onOpenImage?: (attachment: Customer360Attachment) => void }> = ({ event, onOpenImage }) => {
  const isManual = event.procedureMode === 'MANUAL' || !event.bookingId;
  const services = event.serviceNames?.length
    ? event.serviceNames
    : event.serviceName
      ? [event.serviceName]
      : [];
  const practitioners = event.practitionerNames?.length
    ? event.practitionerNames
    : event.actorName
      ? [event.actorName]
      : [];

  return (
    <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, border: '1px solid var(--border)', borderRadius: 2.25, bgcolor: 'var(--surface)' }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: '#E8F7F4', color: '#0F766E', flexShrink: 0 }}>
          <MedicalServicesRoundedIcon />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: { xs: '1rem', sm: '1.08rem' }, fontWeight: 760, color: 'var(--text-primary)' }}>
                {event.title}
              </Typography>
              <Chip
                size="small"
                label={isManual ? 'Manual procedure' : 'Booked procedure'}
                sx={{ mt: 0.7, height: 24, fontSize: '0.68rem', fontWeight: 650, bgcolor: isManual ? '#F3EEFF' : '#E8F7F4', color: isManual ? '#7C3AED' : '#0F766E' }}
              />
            </Box>
            <Box sx={{ px: 1.25, py: 0.85, borderRadius: 1.25, bgcolor: 'var(--surface-secondary)', border: '1px solid var(--border)', minWidth: { sm: 245 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'var(--primary)' }}>
                <AccessTimeRoundedIcon sx={{ fontSize: 18 }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 720, color: 'var(--text-primary)' }}>
                  {formatProcedureDateTime(event.occurredAt)}
                </Typography>
              </Box>
            </Box>
          </Box>

          {services.length > 0 && (
            <Box sx={{ mt: 1.75 }}>
              <Typography sx={{ mb: 0.75, fontSize: '0.68rem', fontWeight: 720, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {services.length === 1 ? 'Procedure' : `${services.length} procedures in this visit`}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {services.map((service) => (
                  <Chip key={service} size="small" label={service} sx={{ height: 27, fontSize: '0.72rem', bgcolor: 'var(--primary-soft)', color: 'var(--primary)' }} />
                ))}
              </Box>
            </Box>
          )}

          {practitioners.length > 0 && (
            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 0.75, color: 'var(--text-secondary)' }}>
              <PersonRoundedIcon sx={{ fontSize: 18, color: 'var(--text-muted)' }} />
              <Typography sx={{ fontSize: '0.78rem' }}>
                Performed by <Box component="span" sx={{ fontWeight: 680, color: 'var(--text-primary)' }}>{practitioners.join(', ')}</Box>
              </Typography>
            </Box>
          )}

          {event.description && (
            <Box sx={{ mt: 1.5, px: 1.25, py: 1, borderLeft: '3px solid #0F766E', borderRadius: '0 6px 6px 0', bgcolor: 'color-mix(in srgb, #0F766E 5%, var(--surface))' }}>
              <Typography sx={{ fontSize: '0.67rem', fontWeight: 720, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Procedure note</Typography>
              <Typography sx={{ mt: 0.35, fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.55, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{event.description}</Typography>
            </Box>
          )}

          {event.attachments.length > 0 && (
            <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.75 }}>
              {event.attachments.map((attachment) => <AttachmentLink key={attachment.id} attachment={attachment} compact onOpenImage={onOpenImage} />)}
            </Box>
          )}
        </Box>
      </Box>
    </Paper>
  );
};

const ConsultationNoteCard: React.FC<{
  event: Customer360Event;
  onOpenImage?: (attachment: Customer360Attachment) => void;
}> = ({ event, onOpenImage }) => {
  const noteText = String(event.description || '').trim();
  const showNoteText = noteText && noteText.toLowerCase() !== event.title.trim().toLowerCase();
  const practitioners = event.practitionerNames?.length
    ? event.practitionerNames
    : event.actorName
      ? [event.actorName]
      : [];

  return (
    <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, border: '1px solid var(--border)', borderRadius: 2.25, bgcolor: 'var(--surface)' }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: '#EAF2FF', color: '#2563EB', flexShrink: 0 }}>
          <DescriptionRoundedIcon />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: { xs: '1rem', sm: '1.08rem' }, fontWeight: 760, color: 'var(--text-primary)' }}>
                {event.title}
              </Typography>
              <Chip size="small" label="Consultation note" sx={{ mt: 0.7, height: 24, fontSize: '0.68rem', fontWeight: 650, bgcolor: '#EAF2FF', color: '#2563EB' }} />
            </Box>
            <Box sx={{ px: 1.25, py: 0.85, borderRadius: 1.25, bgcolor: 'var(--surface-secondary)', border: '1px solid var(--border)', minWidth: { sm: 245 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <AccessTimeRoundedIcon sx={{ fontSize: 18, color: '#2563EB' }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 720, color: 'var(--text-primary)' }}>
                  {formatProcedureDateTime(event.occurredAt)}
                </Typography>
              </Box>
            </Box>
          </Box>

          {practitioners.length > 0 && (
            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 0.75, color: 'var(--text-secondary)' }}>
              <PersonRoundedIcon sx={{ fontSize: 18, color: 'var(--text-muted)' }} />
              <Typography sx={{ fontSize: '0.78rem' }}>
                Recorded by <Box component="span" sx={{ fontWeight: 680, color: 'var(--text-primary)' }}>{practitioners.join(', ')}</Box>
              </Typography>
            </Box>
          )}

          {showNoteText && (
            <Box sx={{ mt: 1.5, px: 1.25, py: 1, borderLeft: '3px solid #2563EB', borderRadius: '0 6px 6px 0', bgcolor: 'color-mix(in srgb, #2563EB 5%, var(--surface))' }}>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.55, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{noteText}</Typography>
            </Box>
          )}

          {event.attachments.length > 0 && (
            <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.75 }}>
              {event.attachments.map((attachment) => <AttachmentLink key={attachment.id} attachment={attachment} compact onOpenImage={onOpenImage} />)}
            </Box>
          )}
        </Box>
      </Box>
    </Paper>
  );
};

const verifiedHttpsUrl = (value?: string | null): string | null => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const AgreementCard: React.FC<{
  event: Customer360Event;
  loadSignedAgreementPdf?: (event: Customer360Event) => Promise<Blob>;
  highlighted?: boolean;
}> = ({ event, loadSignedAgreementPdf, highlighted }) => {
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState('');
  const [previewRequested, setPreviewRequested] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const mountedRef = useRef(true);
  const pdfRequestInFlightRef = useRef(false);
  const generatedPdfUrlRef = useRef('');
  const originalUrl = verifiedHttpsUrl(event.agreementDocumentUrl);
  const signatureUrl = verifiedHttpsUrl(event.agreementSignatureUrl);
  const finalizedPdfUrl = isFinalizedAgreementPdfUrl(signatureUrl) ? signatureUrl : null;
  const isSigned = Boolean(signatureUrl) && event.description !== 'Agreement not confirmed';
  const signedPdfUrl = previewRequested ? (finalizedPdfUrl || generatedPdfUrl) : '';
  const previewId = `${agreementDomId(event.id)}-pdf-preview`;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (generatedPdfUrlRef.current) URL.revokeObjectURL(generatedPdfUrlRef.current);
    };
  }, []);

  const requestPdfPreview = useCallback(async () => {
    setPreviewRequested(true);
    setPdfError('');
    if (finalizedPdfUrl || generatedPdfUrl || pdfRequestInFlightRef.current) return;
    if (!isSigned || !originalUrl || !loadSignedAgreementPdf) {
      setPdfError('The original document or signed agreement is not stored for this agreement.');
      return;
    }

    pdfRequestInFlightRef.current = true;
    setPdfLoading(true);
    try {
      const blob = await loadSignedAgreementPdf(event);
      const nextPdfUrl = URL.createObjectURL(blob);
      if (!mountedRef.current) {
        URL.revokeObjectURL(nextPdfUrl);
        return;
      }
      if (generatedPdfUrlRef.current) URL.revokeObjectURL(generatedPdfUrlRef.current);
      generatedPdfUrlRef.current = nextPdfUrl;
      setGeneratedPdfUrl(nextPdfUrl);
    } catch (error) {
      if (mountedRef.current) {
        setPdfError(error instanceof Error ? error.message : 'The printable PDF could not be prepared.');
      }
    } finally {
      pdfRequestInFlightRef.current = false;
      if (mountedRef.current) setPdfLoading(false);
    }
  }, [event, finalizedPdfUrl, generatedPdfUrl, isSigned, loadSignedAgreementPdf, originalUrl]);

  return (
    <Paper
      id={agreementDomId(event.id)}
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        border: highlighted ? '2px solid #168260' : '1px solid var(--border)',
        borderRadius: 2.25,
        bgcolor: 'var(--surface)',
        scrollMarginTop: 88,
        boxShadow: highlighted ? '0 0 0 4px color-mix(in srgb, #168260 9%, transparent)' : 'none',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', gap: 1.25, minWidth: 0 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: '#EAFBF4', color: '#168260', flexShrink: 0 }}>
            <AssignmentTurnedInRoundedIcon />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: { xs: '1rem', sm: '1.08rem' }, fontWeight: 760, color: 'var(--text-primary)' }}>{event.title}</Typography>
            <Chip
              size="small"
              label={isSigned ? 'Signed in TaskFlow' : 'Signature not available'}
              sx={{ mt: 0.7, height: 24, fontSize: '0.68rem', fontWeight: 650, bgcolor: isSigned ? '#EAFBF4' : 'var(--surface-secondary)', color: isSigned ? '#168260' : 'var(--text-secondary)' }}
            />
            {event.agreementSignedAt && (
              <Typography sx={{ mt: 0.7, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Signed {formatCustomerDateTime(event.agreementSignedAt)}
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Button
            onClick={() => void requestPdfPreview()}
            size="small"
            variant="contained"
            startIcon={<PrintRoundedIcon />}
            disabled={pdfLoading || !isSigned}
            aria-controls={previewId}
            aria-expanded={previewRequested}
            sx={{ textTransform: 'none', boxShadow: 'none', bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary)' } }}
          >
            {pdfLoading ? 'Preparing PDF…' : 'View signed PDF'}
          </Button>
          {signedPdfUrl && <Button component="a" href={signedPdfUrl} target="_blank" rel="noopener noreferrer" size="small" variant="outlined" endIcon={<OpenInNewRoundedIcon />} sx={{ textTransform: 'none', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>Open in new tab</Button>}
          {previewRequested && (signedPdfUrl || pdfError) && <Button size="small" variant="text" onClick={() => setPreviewRequested(false)} sx={{ textTransform: 'none', color: 'var(--text-secondary)' }}>Hide preview</Button>}
          {originalUrl && <Button component="a" href={originalUrl} target="_blank" rel="noopener noreferrer" size="small" variant="outlined" endIcon={<OpenInNewRoundedIcon />} sx={{ textTransform: 'none', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>Original</Button>}
          {signatureUrl && <Button component="a" href={signatureUrl} target="_blank" rel="noopener noreferrer" size="small" variant="text" endIcon={<OpenInNewRoundedIcon />} sx={{ textTransform: 'none', color: 'var(--text-secondary)' }}>{finalizedPdfUrl ? 'Final PDF' : 'Signature source'}</Button>}
        </Box>
      </Box>

      {!previewRequested && (
        <Typography sx={{ mt: 1.5, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          The signed PDF loads only when you choose View signed PDF.
        </Typography>
      )}

      {pdfLoading && (
        <Box id={previewId} sx={{ mt: 2, minHeight: 180, display: 'grid', placeItems: 'center', border: '1px solid var(--border)', borderRadius: 1.5, bgcolor: 'var(--surface-secondary)' }}>
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress size={24} />
            <Typography sx={{ mt: 1, fontSize: '0.74rem', fontWeight: 650, color: 'var(--text-secondary)' }}>Preparing the signed original…</Typography>
          </Box>
        </Box>
      )}

      {signedPdfUrl && (
        <Box
          component="iframe"
          id={previewId}
          src={signedPdfUrl}
          title={`${event.title} signed agreement`}
          sx={{
            mt: 2,
            display: 'block',
            width: '100%',
            height: { xs: 520, md: 720 },
            border: '1px solid var(--border)',
            borderRadius: 1.5,
            bgcolor: '#fff',
          }}
        />
      )}

      {previewRequested && pdfError && (
        <Alert id={previewId} severity="warning" sx={{ mt: 2, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
          {pdfError} The original document and signature source remain available for review.
        </Alert>
      )}

      {previewRequested && !pdfLoading && !signedPdfUrl && !pdfError && (
        <Box sx={{ mt: 2, p: 2, borderRadius: 1.5, bgcolor: 'var(--surface-secondary)', border: '1px dashed var(--border)', textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 650, color: 'var(--text-primary)' }}>
            {originalUrl && signatureUrl ? 'Printable composition is unavailable.' : 'The original document or signed agreement is not stored for this agreement.'}
          </Typography>
          <Typography sx={{ mt: 0.35, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            Legacy records require both the original document and the saved TaskFlow signature.
          </Typography>
        </Box>
      )}

      <Typography sx={{ mt: 1.25, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
        {finalizedPdfUrl
          ? 'This is the immutable combined PDF finalized by GT API.'
          : 'This legacy printable copy places the saved TaskFlow signature and signing date on detected fields in the original document.'}
      </Typography>
    </Paper>
  );
};

const SnapshotItem: React.FC<{ label: string; event?: Customer360Event }> = ({ label, event }) => (
  <Box sx={{ p: 1.5, minWidth: 0 }}>
    <Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</Typography>
    <Typography sx={{ mt: 0.55, fontSize: '0.82rem', fontWeight: 680, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {event?.title || 'Nothing recorded yet'}
    </Typography>
    <Typography sx={{ mt: 0.25, fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{event ? formatCustomerDateTime(event.occurredAt) : '—'}</Typography>
  </Box>
);

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; detail: string }> = ({ icon, title, detail }) => (
  <Box sx={{ py: 6, px: 2, textAlign: 'center', color: 'var(--text-secondary)' }}>
    <Box sx={{ mx: 'auto', mb: 1.5, width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'var(--surface-secondary)', color: 'var(--text-muted)' }}>{icon}</Box>
    <Typography sx={{ fontWeight: 700, color: 'var(--text-primary)' }}>{title}</Typography>
    <Typography sx={{ mt: 0.5, fontSize: '0.78rem' }}>{detail}</Typography>
  </Box>
);

export const Customer360PanelView: React.FC<Customer360PanelViewProps> = ({
  data,
  customerName,
  refreshing,
  onRefresh,
  loadSignedAgreementPdf,
}) => {
  const [tab, setTab] = useState<Customer360Tab>('timeline');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedAgreementId, setSelectedAgreementId] = useState('');
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);

  const businessEvents = useMemo(
    () => curateCustomer360Events(data.events).map(withCustomerVisibleAttachments),
    [data.events],
  );
  const hiddenSystemEventCount = data.events.length - businessEvents.length;
  const datedEvents = useMemo(() => businessEvents.filter((event) => Boolean(event.occurredAt)), [businessEvents]);
  const consultations = useMemo(() => businessEvents.filter(isConsultationNoteEvent), [businessEvents]);
  const procedures = useMemo(() => businessEvents.filter((event) => event.type === 'PROCEDURE'), [businessEvents]);
  const notes = useMemo(() => businessEvents.filter((event) => event.type === 'INTERNAL_NOTE'), [businessEvents]);
  const agreements = useMemo(() => businessEvents.filter(isSignedAgreementEvent), [businessEvents]);
  const files = useMemo(() => {
    const seen = new Set<string>();
    return businessEvents.flatMap((event) => event.attachments.map((attachment) => ({ attachment, event })))
      .filter(({ attachment, event }) => !(
        event.type === 'CONSENT'
        && (attachment.kind === 'AGREEMENT_DOCUMENT' || attachment.kind === 'SIGNATURE')
      ))
      .filter(({ attachment }) => {
        if (seen.has(attachment.url)) return false;
        seen.add(attachment.url);
        return true;
      });
  }, [businessEvents]);
  const imageItems = useMemo(() => files
    .filter(({ attachment }) => isCustomer360Image(attachment))
    .map(({ attachment, event }) => ({
      attachment,
      context: event.title,
      occurredAt: event.occurredAt,
    })), [files]);

  const latest = datedEvents[0];
  const latestProcedure = datedEvents.find((event) => event.type === 'PROCEDURE');
  const latestNote = notes.find((event) => Boolean(event.occurredAt));
  const taskflowEntryCount = businessEvents.length;
  const procedureCount = procedures.length;
  const consentCount = agreements.length;

  const openAgreement = useCallback((agreement: Customer360Event) => {
    const agreementIndex = agreements.findIndex((candidate) => candidate.id === agreement.id);
    setVisibleCount(Math.max(PAGE_SIZE, agreementIndex + 1));
    setSelectedAgreementId(agreement.id);
    setTab('agreements');
  }, [agreements]);

  const openImage = useCallback((attachment: Customer360Attachment) => {
    const index = imageItems.findIndex((item) => (
      item.attachment.id === attachment.id
      || item.attachment.url === attachment.url
    ));
    if (index >= 0) setActiveImageIndex(index);
  }, [imageItems]);

  useEffect(() => {
    if (tab !== 'agreements' || !selectedAgreementId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(agreementDomId(selectedAgreementId))?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedAgreementId, tab, visibleCount]);

  const summaryItems = [
    { label: 'Useful records', value: taskflowEntryCount, icon: <TimelineRoundedIcon fontSize="small" /> },
    { label: 'Consultation notes', value: consultations.length, icon: <DescriptionRoundedIcon fontSize="small" /> },
    { label: 'Procedures', value: procedureCount, icon: <MedicalServicesRoundedIcon fontSize="small" /> },
    { label: 'Notes', value: notes.length, icon: <StickyNote2RoundedIcon fontSize="small" /> },
    { label: 'Files & photos', value: files.length, icon: <FolderRoundedIcon fontSize="small" /> },
    { label: 'Agreements', value: consentCount, icon: <AssignmentTurnedInRoundedIcon fontSize="small" /> },
  ];

  if (businessEvents.length === 0) {
    return (
      <Paper elevation={0} sx={{ mb: 3, p: { xs: 2, sm: 2.5 }, border: '1px solid var(--border)', borderRadius: 2.5, bgcolor: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, minWidth: 0 }}>
            <Box sx={{ mt: 0.1, width: 36, height: 36, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'var(--primary-soft)', color: 'var(--primary)', flexShrink: 0 }}>
              <TimelineRoundedIcon />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 750, color: 'var(--text-primary)' }}>Customer story</Typography>
                <Chip icon={<LockRoundedIcon sx={{ fontSize: '14px !important' }} />} size="small" label="Read only" sx={{ height: 23, fontSize: '0.66rem', bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }} />
              </Box>
              <Typography sx={{ mt: 0.45, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                No treatment notes, procedures, consent forms, photos or documents are recorded in TaskFlow for {customerName || 'this customer'}.
              </Typography>
              {hiddenSystemEventCount > 0 && (
                <Typography sx={{ mt: 0.45, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {hiddenSystemEventCount.toLocaleString()} system synchronization {hiddenSystemEventCount === 1 ? 'log is' : 'logs are'} hidden from this business view.
                </Typography>
              )}
            </Box>
          </Box>
          {onRefresh && (
            <Tooltip title="Refresh TaskFlow data">
              <span>
                <IconButton size="small" onClick={onRefresh} disabled={refreshing} aria-label="Refresh TaskFlow data" sx={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  {refreshing ? <CircularProgress size={17} /> : <RefreshRoundedIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ mb: 3, border: '1px solid var(--border)', borderRadius: 2.5, overflow: 'hidden', bgcolor: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
      <Box sx={{ p: { xs: 2, sm: 2.5 }, borderBottom: '1px solid var(--border)' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, minWidth: 0 }}>
            <Box sx={{ mt: 0.1, width: 36, height: 36, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'var(--primary-soft)', color: 'var(--primary)', flexShrink: 0 }}>
              <TimelineRoundedIcon />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '1.05rem', fontWeight: 760, color: 'var(--text-primary)' }}>Customer story</Typography>
                <Chip icon={<LockRoundedIcon sx={{ fontSize: '14px !important' }} />} size="small" label="Read only" sx={{ height: 23, fontSize: '0.66rem', bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }} />
                {hiddenSystemEventCount > 0 && <Chip size="small" label={`${hiddenSystemEventCount.toLocaleString()} system logs hidden`} sx={{ height: 23, fontSize: '0.66rem', bgcolor: 'var(--surface-secondary)', color: 'var(--text-muted)' }} />}
              </Box>
              <Typography sx={{ mt: 0.35, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                TaskFlow care activity, notes and files for {customerName || 'this customer'} — together in one place.
              </Typography>
            </Box>
          </Box>
          {onRefresh && (
            <Tooltip title="Refresh TaskFlow data">
              <span>
                <IconButton size="small" onClick={onRefresh} disabled={refreshing} aria-label="Refresh TaskFlow data" sx={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  {refreshing ? <CircularProgress size={17} /> : <RefreshRoundedIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>

        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' }, gap: 1 }}>
          {summaryItems.map((item) => (
            <Box key={item.label} sx={{ p: 1.25, border: '1px solid var(--border)', borderRadius: 1.5, bgcolor: 'var(--surface-secondary)', minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, color: 'var(--primary)' }}>
                <Typography sx={{ fontSize: '1.05rem', lineHeight: 1, fontWeight: 780, color: 'var(--text-primary)' }}>{item.value.toLocaleString()}</Typography>
                {item.icon}
              </Box>
              <Typography sx={{ mt: 0.55, fontSize: '0.67rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, border: '1px solid var(--border)', borderRadius: 1.5, bgcolor: 'var(--surface)', '& > *:not(:last-child)': { borderRight: { md: '1px solid var(--border)' }, borderBottom: { xs: '1px solid var(--border)', md: 0 } } }}>
          <SnapshotItem label="Latest recorded activity" event={latest} />
          <SnapshotItem label="Latest care record" event={latestProcedure} />
          <SnapshotItem label="Latest internal note" event={latestNote} />
        </Box>

        {data.truncated && (
          <Alert severity="info" icon={false} sx={{ mt: 1.5, py: 0.25, px: 1.25, bgcolor: 'var(--primary-soft)', color: 'var(--text-secondary)', '& .MuiAlert-message': { fontSize: '0.72rem' } }}>
            Showing TaskFlow activity linked to the latest {data.scannedBookingCount.toLocaleString()} of {data.totalBookingCount.toLocaleString()} visits. Older GreatTime history remains available below.
          </Alert>
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, next: Customer360Tab) => {
          setTab(next);
          setVisibleCount(PAGE_SIZE);
          setSelectedAgreementId('');
        }}
        variant="scrollable"
        scrollButtons={false}
        sx={{ px: { xs: 1, sm: 2 }, minHeight: 46, borderBottom: '1px solid var(--border)', '& .MuiTab-root': { minHeight: 46, textTransform: 'none', fontSize: '0.78rem', fontWeight: 650, color: 'var(--text-secondary)' }, '& .Mui-selected': { color: 'var(--primary) !important' }, '& .MuiTabs-indicator': { bgcolor: 'var(--primary)' } }}
      >
        <Tab value="timeline" icon={<TimelineRoundedIcon />} iconPosition="start" label={`Timeline (${datedEvents.length})`} />
        <Tab value="consultations" icon={<DescriptionRoundedIcon />} iconPosition="start" label={`Consultation notes (${consultations.length})`} />
        <Tab value="procedures" icon={<MedicalServicesRoundedIcon />} iconPosition="start" label={`Procedures (${procedures.length})`} />
        <Tab value="notes" icon={<StickyNote2RoundedIcon />} iconPosition="start" label={`Notes (${notes.length})`} />
        <Tab value="agreements" icon={<AssignmentTurnedInRoundedIcon />} iconPosition="start" label={`Agreements (${agreements.length})`} />
        <Tab value="files" icon={<FolderRoundedIcon />} iconPosition="start" label={`Documents & photos (${files.length})`} />
      </Tabs>

      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        {tab === 'timeline' && (
          datedEvents.length ? (
            <>
              <Box sx={{ maxWidth: 1040 }}>
                {datedEvents.slice(0, visibleCount).map((event) => (
                  <EventRow key={event.id} event={event} onOpenAgreement={openAgreement} onOpenImage={openImage} />
                ))}
              </Box>
              {visibleCount < datedEvents.length && (
                <Box sx={{ pl: { xs: '55px', sm: '72px' } }}>
                  <Button size="small" variant="outlined" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} sx={{ textTransform: 'none', color: 'var(--primary)', borderColor: 'var(--border)' }}>Show more activity</Button>
                </Box>
              )}
            </>
          ) : <EmptyState icon={<TimelineRoundedIcon />} title="No dated TaskFlow activity yet" detail="New treatment activity will appear here automatically." />
        )}

        {tab === 'procedures' && (
          procedures.length ? (
            <Box sx={{ display: 'grid', gap: 1.25, maxWidth: 1120 }}>
              {procedures.slice(0, visibleCount).map((procedure) => <ProcedureCard key={procedure.id} event={procedure} onOpenImage={openImage} />)}
              {visibleCount < procedures.length && <Button size="small" variant="outlined" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} sx={{ width: 'fit-content', textTransform: 'none', color: 'var(--primary)', borderColor: 'var(--border)' }}>Show more procedures</Button>}
            </Box>
          ) : <EmptyState icon={<MedicalServicesRoundedIcon />} title="No procedures found" detail="Booked and manual TaskFlow procedures will appear together here." />
        )}

        {tab === 'consultations' && (
          consultations.length ? (
            <Box sx={{ display: 'grid', gap: 1.25, maxWidth: 1120 }}>
              {consultations.slice(0, visibleCount).map((consultation) => (
                <ConsultationNoteCard key={consultation.id} event={consultation} onOpenImage={openImage} />
              ))}
              {visibleCount < consultations.length && <Button size="small" variant="outlined" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} sx={{ width: 'fit-content', textTransform: 'none', color: 'var(--primary)', borderColor: 'var(--border)' }}>Show more consultation notes</Button>}
            </Box>
          ) : <EmptyState icon={<DescriptionRoundedIcon />} title="No consultation notes found" detail="TaskFlow consultation notes linked to this customer will appear here." />
        )}

        {tab === 'notes' && (
          notes.length ? (
            <Box sx={{ display: 'grid', gap: 1.25, maxWidth: 1040 }}>
              {notes.slice(0, visibleCount).map((note) => (
                <Paper key={note.id} elevation={0} sx={{ p: { xs: 2, sm: 2.25 }, border: '1px solid var(--border)', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', gap: 1.25 }}>
                    <Box sx={{ width: 34, height: 34, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: '#F3EEFF', color: '#7C3AED', flexShrink: 0 }}><StickyNote2RoundedIcon fontSize="small" /></Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>{note.actorName ? `Note from ${note.actorName}` : 'Internal note'}</Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{formatCustomerDateTime(note.occurredAt)}</Typography>
                      </Box>
                      <Typography
                        sx={{
                          mt: 1,
                          px: 1.25,
                          py: 0.85,
                          borderLeft: '3px solid #7C3AED',
                          borderRadius: '0 6px 6px 0',
                          bgcolor: 'color-mix(in srgb, #7C3AED 6%, var(--surface))',
                          fontSize: { xs: '0.96rem', sm: '1.02rem' },
                          fontWeight: 620,
                          lineHeight: 1.65,
                          letterSpacing: '0.005em',
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {note.description || 'No note text recorded.'}
                      </Typography>
                      {note.serviceName && <Chip size="small" label={note.serviceName} sx={{ mt: 1, height: 23, fontSize: '0.66rem', bgcolor: 'var(--primary-soft)', color: 'var(--primary)' }} />}
                      {note.attachments.length > 0 && <Box sx={{ mt: 1.25, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.75 }}>{note.attachments.map((attachment) => <AttachmentLink key={attachment.id} attachment={attachment} compact onOpenImage={openImage} />)}</Box>}
                    </Box>
                  </Box>
                </Paper>
              ))}
              {visibleCount < notes.length && <Button size="small" variant="outlined" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} sx={{ width: 'fit-content', textTransform: 'none', color: 'var(--primary)', borderColor: 'var(--border)' }}>Show more notes</Button>}
            </Box>
          ) : <EmptyState icon={<StickyNote2RoundedIcon />} title="No internal notes found" detail="TaskFlow staff notes linked to this customer will appear here." />
        )}

        {tab === 'agreements' && (
          agreements.length ? (
            <Box sx={{ display: 'grid', gap: 1.25, maxWidth: 1120 }}>
              {agreements.slice(0, visibleCount).map((agreement) => (
                <AgreementCard
                  key={agreement.id}
                  event={agreement}
                  loadSignedAgreementPdf={loadSignedAgreementPdf}
                  highlighted={agreement.id === selectedAgreementId}
                />
              ))}
              {visibleCount < agreements.length && <Button size="small" variant="outlined" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} sx={{ width: 'fit-content', textTransform: 'none', color: 'var(--primary)', borderColor: 'var(--border)' }}>Show more agreements</Button>}
            </Box>
          ) : <EmptyState icon={<AssignmentTurnedInRoundedIcon />} title="No signed agreements found" detail="TaskFlow agreements with their original document and saved signature will appear here." />
        )}

        {tab === 'files' && (
          files.length ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
              {files.slice(0, visibleCount).map(({ attachment, event }) => (
                <Box key={`${event.id}:${attachment.id}`} sx={{ minWidth: 0 }}>
                  <AttachmentLink attachment={attachment} onOpenImage={openImage} />
                  <Box sx={{ px: 0.5, pt: 0.55, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.64rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</Typography>
                    <Typography sx={{ fontSize: '0.64rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatCustomerDateTime(event.occurredAt)}</Typography>
                  </Box>
                </Box>
              ))}
              {visibleCount < files.length && <Button size="small" variant="outlined" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} sx={{ width: 'fit-content', textTransform: 'none', color: 'var(--primary)', borderColor: 'var(--border)' }}>Show more files</Button>}
            </Box>
          ) : <EmptyState icon={<FolderRoundedIcon />} title="No TaskFlow files found" detail="Documents, consent signatures and treatment photos will appear here." />
        )}
      </Box>
      <CustomerImageLightbox
        open={activeImageIndex !== null}
        images={imageItems}
        activeIndex={activeImageIndex ?? 0}
        onClose={() => setActiveImageIndex(null)}
        onNavigate={setActiveImageIndex}
      />
    </Paper>
  );
};

const LoadingPanel = () => (
  <Paper elevation={0} sx={{ mb: 3, p: { xs: 2, sm: 2.5 }, border: '1px solid var(--border)', borderRadius: 2.5, bgcolor: 'var(--surface)' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Skeleton variant="rounded" width={36} height={36} />
      <Box sx={{ flex: 1 }}><Skeleton width={180} /><Skeleton width="42%" /></Box>
    </Box>
    <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)' }, gap: 1 }}>
      {[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} variant="rounded" height={64} />)}
    </Box>
    <Skeleton variant="rounded" height={105} sx={{ mt: 1.5 }} />
  </Paper>
);

const Customer360Panel: React.FC<Customer360PanelProps> = ({ phoneNumber, clinicCode, customerName }) => {
  const { getAccessToken } = useAuth();
  const [data, setData] = useState<Customer360Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!phoneNumber || !clinicCode) {
      setError('Customer or clinic information is unavailable.');
      setLoading(false);
      return;
    }
    if (!CUSTOMER360_API_BASE_URL) {
      setError('TaskFlow data service is not configured.');
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('TASKFLOW_SESSION_REQUIRED');
      }
      const response = await fetch(`${CUSTOMER360_API_BASE_URL}/customer360`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: QUERY,
          variables: { clinicCode, phoneNumber, take: 25 },
        }),
      });
      const payload = await response.json() as {
        data?: { customer360V1?: Customer360Data };
        errors?: Array<{ message: string }>;
      };
      if (!response.ok || payload.errors?.length || !payload.data?.customer360V1) {
        const message = payload.errors?.[0]?.message || 'TaskFlow customer data could not be loaded.';
        if (message.includes('Cannot query field')) throw new Error('TASKFLOW_NOT_DEPLOYED');
        throw new Error(message);
      }
      setData(payload.data.customer360V1);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '';
      if (message === 'TASKFLOW_SESSION_REQUIRED') {
        setError('Sign out and sign back in once to enable the secure TaskFlow view for this session.');
      } else if (message === 'TASKFLOW_NOT_DEPLOYED') {
        setError('The TaskFlow Customer 360 service is not available in this environment yet.');
      } else {
        setError(message || 'TaskFlow customer data could not be loaded.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clinicCode, getAccessToken, phoneNumber]);

  const loadSignedAgreementPdf = useCallback(async (event: Customer360Event): Promise<Blob> => {
    if (!CUSTOMER360_API_BASE_URL) {
      throw new Error('The printable agreement service is not configured.');
    }
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Sign out and sign back in once to open printable agreements.');
    }

    const endpoint = new URL(
      `${CUSTOMER360_API_BASE_URL}/agreements/${encodeURIComponent(event.sourceId)}/signed.pdf`,
    );
    endpoint.searchParams.set('clinicCode', clinicCode);
    endpoint.searchParams.set('phoneNumber', phoneNumber);
    const response = await fetch(endpoint.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string; code?: string };
      if (
        payload.code === 'AGREEMENT_NOT_PDF'
        && event.agreementDocumentUrl
        && event.agreementSignatureUrl
      ) {
        return composeLegacyImageAgreementPdf({
          documentUrl: event.agreementDocumentUrl,
          signatureUrl: event.agreementSignatureUrl,
          signatureAlign: event.agreementSignatureAlign,
          signedAt: event.agreementSignedAt || event.occurredAt,
        });
      }
      throw new Error(payload.error || 'The printable signed agreement could not be prepared.');
    }
    if (!String(response.headers.get('content-type') || '').includes('application/pdf')) {
      throw new Error('The printable agreement response was not a PDF.');
    }
    return response.blob();
  }, [clinicCode, getAccessToken, phoneNumber]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) return <LoadingPanel />;
  if (error || !data) {
    return (
      <Paper elevation={0} sx={{ mb: 3, p: { xs: 2, sm: 2.5 }, border: '1px solid var(--border)', borderRadius: 2.5, bgcolor: 'var(--surface)' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'var(--primary-soft)', color: 'var(--primary)', flexShrink: 0 }}><TimelineRoundedIcon /></Box>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 750 }}>Customer story</Typography>
              <Chip icon={<LockRoundedIcon sx={{ fontSize: '14px !important' }} />} size="small" label="Read only" sx={{ height: 23, fontSize: '0.66rem', bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }} />
            </Box>
            <Typography sx={{ mt: 0.45, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{error}</Typography>
            <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={() => void fetchData()} sx={{ mt: 1, px: 0, textTransform: 'none', color: 'var(--primary)' }}>Try again</Button>
          </Box>
        </Box>
      </Paper>
    );
  }

  return (
    <Customer360PanelView
      data={data}
      customerName={customerName}
      refreshing={refreshing}
      onRefresh={() => void fetchData(true)}
      loadSignedAgreementPdf={loadSignedAgreementPdf}
    />
  );
};

export default Customer360Panel;
