import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ArrowBackIosNewRoundedIcon from '@mui/icons-material/ArrowBackIosNewRounded';
import ArrowForwardIosRoundedIcon from '@mui/icons-material/ArrowForwardIosRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import type { Customer360MediaAttachment } from './customer360Media';

export interface Customer360ImageItem {
  attachment: Customer360MediaAttachment;
  context?: string;
  occurredAt?: string | null;
}

interface CustomerImageLightboxProps {
  open: boolean;
  images: Customer360ImageItem[];
  activeIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const CustomerImageLightbox: React.FC<CustomerImageLightboxProps> = ({
  open,
  images,
  activeIndex,
  onClose,
  onNavigate,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [imageError, setImageError] = useState(false);
  const safeIndex = images.length === 0 ? 0 : Math.min(Math.max(activeIndex, 0), images.length - 1);
  const current = images[safeIndex];
  const hasMultiple = images.length > 1;

  const goTo = useCallback((index: number) => {
    if (!images.length) return;
    onNavigate((index + images.length) % images.length);
  }, [images.length, onNavigate]);

  useEffect(() => {
    setImageError(false);
  }, [current?.attachment.url]);

  useEffect(() => {
    if (!open || !hasMultiple) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') goTo(safeIndex - 1);
      if (event.key === 'ArrowRight') goTo(safeIndex + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goTo, hasMultiple, open, safeIndex]);

  return (
    <Dialog
      open={open && Boolean(current)}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="lg"
      aria-labelledby="customer-image-viewer-title"
      PaperProps={{
        sx: {
          overflow: 'hidden',
          bgcolor: '#101418',
          color: '#fff',
          borderRadius: fullScreen ? 0 : 2.5,
          minHeight: fullScreen ? '100%' : 'min(82vh, 840px)',
        },
      }}
      BackdropProps={{ sx: { bgcolor: 'rgba(3, 8, 12, 0.82)', backdropFilter: 'blur(4px)' } }}
    >
      {current && (
        <>
          <Box sx={{ px: { xs: 1.5, sm: 2 }, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography id="customer-image-viewer-title" sx={{ fontSize: { xs: '0.88rem', sm: '1rem' }, fontWeight: 720, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {current.attachment.name || 'Treatment photo'}
              </Typography>
              <Typography sx={{ mt: 0.2, fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)' }}>
                {[current.context, images.length > 1 ? `${safeIndex + 1} of ${images.length}` : 'Photo'].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <Tooltip title="Close image viewer">
              <IconButton onClick={onClose} aria-label="Close image viewer" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.08)', '&:hover': { bgcolor: 'rgba(255,255,255,0.16)' } }}>
                <CloseRoundedIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <DialogContent sx={{ p: { xs: 1, sm: 2 }, display: 'grid', placeItems: 'center', position: 'relative', minHeight: 0, bgcolor: '#080b0e' }}>
            {imageError ? (
              <Box sx={{ maxWidth: 420, textAlign: 'center', px: 3 }}>
                <Typography sx={{ fontWeight: 700 }}>This image could not be previewed.</Typography>
                <Typography sx={{ mt: 0.75, fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)' }}>Use “Open original” below to view it from the source.</Typography>
              </Box>
            ) : (
              <Box
                component="img"
                src={current.attachment.url}
                alt={current.attachment.name || 'Treatment photo'}
                onError={() => setImageError(true)}
                sx={{ display: 'block', maxWidth: '100%', maxHeight: fullScreen ? 'calc(100vh - 150px)' : 'calc(82vh - 150px)', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: 1 }}
              />
            )}

            {hasMultiple && (
              <>
                <IconButton onClick={() => goTo(safeIndex - 1)} aria-label="Previous image" sx={{ position: 'absolute', left: { xs: 8, sm: 18 }, top: '50%', transform: 'translateY(-50%)', color: '#fff', bgcolor: 'rgba(0,0,0,0.55)', '&:hover': { bgcolor: 'rgba(0,0,0,0.78)' } }}>
                  <ArrowBackIosNewRoundedIcon />
                </IconButton>
                <IconButton onClick={() => goTo(safeIndex + 1)} aria-label="Next image" sx={{ position: 'absolute', right: { xs: 8, sm: 18 }, top: '50%', transform: 'translateY(-50%)', color: '#fff', bgcolor: 'rgba(0,0,0,0.55)', '&:hover': { bgcolor: 'rgba(0,0,0,0.78)' } }}>
                  <ArrowForwardIosRoundedIcon />
                </IconButton>
              </>
            )}
          </DialogContent>

          <DialogActions sx={{ px: { xs: 1.5, sm: 2 }, py: 1.25, justifyContent: 'space-between', gap: 1, borderTop: '1px solid rgba(255,255,255,0.12)', flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.58)' }}>Use ← and → keys to browse · Esc to close</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button component="a" href={current.attachment.url} download={current.attachment.name || true} size="small" startIcon={<DownloadRoundedIcon />} sx={{ color: '#fff', textTransform: 'none' }}>
                Download
              </Button>
              <Button component="a" href={current.attachment.url} target="_blank" rel="noopener noreferrer" size="small" variant="outlined" endIcon={<OpenInNewRoundedIcon />} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.42)', textTransform: 'none', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}>
                Open original
              </Button>
            </Box>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};

export default CustomerImageLightbox;
