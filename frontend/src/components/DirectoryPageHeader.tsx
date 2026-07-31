import React from 'react';
import { Box, Stack, Typography } from '@mui/material';

interface DirectoryPageHeaderProps {
  title: string;
  subtitle: string;
  count?: number;
  countLabel?: string;
  actions?: React.ReactNode;
}

const DirectoryPageHeader: React.FC<DirectoryPageHeaderProps> = ({
  title,
  subtitle,
  count,
  countLabel = 'records',
  actions,
}) => (
  <Stack
    direction={{ xs: 'column', sm: 'row' }}
    alignItems={{ xs: 'flex-start', sm: 'center' }}
    justifyContent="space-between"
    spacing={2}
    sx={{ mb: 3 }}
  >
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap" useFlexGap>
        <Typography
          component="h1"
          sx={{
            color: 'var(--text-primary)',
            fontSize: { xs: '1.65rem', md: '2rem' },
            fontWeight: 750,
            letterSpacing: '-0.035em',
            lineHeight: 1.15,
          }}
        >
          {title}
        </Typography>
        {typeof count === 'number' && (
          <Box
            component="span"
            sx={{
              px: 1.15,
              py: 0.45,
              borderRadius: '999px',
              bgcolor: 'var(--primary-soft)',
              color: 'var(--primary)',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {count.toLocaleString()} {countLabel}
          </Box>
        )}
      </Stack>
      <Typography sx={{ mt: 0.65, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        {subtitle}
      </Typography>
    </Box>
    {actions && (
      <Stack direction="row" spacing={1} sx={{ flexShrink: 0, width: { xs: '100%', sm: 'auto' } }}>
        {actions}
      </Stack>
    )}
  </Stack>
);

export default DirectoryPageHeader;
