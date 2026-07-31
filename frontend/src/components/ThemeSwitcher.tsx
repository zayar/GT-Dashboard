import React, { useState } from 'react';
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  BrightnessAuto as SystemIcon,
  Check as CheckIcon,
  DarkModeOutlined as DarkIcon,
  LightModeOutlined as LightIcon,
} from '@mui/icons-material';
import { type ThemePreference, useAppTheme } from '../theme/ThemeContext';

const options: Array<{
  value: ThemePreference;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: 'light', label: 'Light mode', icon: <LightIcon fontSize="small" /> },
  { value: 'dark', label: 'Dark mode', icon: <DarkIcon fontSize="small" /> },
  { value: 'system', label: 'Use system setting', icon: <SystemIcon fontSize="small" /> },
];

const ThemeSwitcher: React.FC = () => {
  const { preference, resolvedMode, setPreference } = useAppTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const CurrentIcon = resolvedMode === 'dark' ? DarkIcon : LightIcon;

  const selectTheme = (value: ThemePreference) => {
    setPreference(value);
    setAnchorEl(null);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ display: { xs: 'none', sm: 'block' }, fontWeight: 500 }}
      >
        Theme Settings
      </Typography>
      <Tooltip title="Theme Settings">
        <IconButton
          aria-label="Open theme settings"
          aria-controls={anchorEl ? 'theme-settings-menu' : undefined}
          aria-haspopup="menu"
          aria-expanded={Boolean(anchorEl)}
          onClick={(event) => setAnchorEl(event.currentTarget)}
          sx={{
            border: '1px solid var(--border)',
            bgcolor: 'var(--surface)',
            color: 'var(--text-primary)',
            '&:hover': { bgcolor: 'var(--surface-secondary)' },
          }}
        >
          <CurrentIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        id="theme-settings-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        MenuListProps={{ 'aria-label': 'Theme preference' }}
      >
        <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
          <Typography variant="subtitle2">Theme Settings</Typography>
          <Typography variant="caption" color="text.secondary">
            Choose how the portal looks
          </Typography>
        </Box>
        {options.map((option) => (
          <MenuItem
            key={option.value}
            selected={preference === option.value}
            onClick={() => selectTheme(option.value)}
            sx={{ minWidth: 230 }}
          >
            <ListItemIcon>{option.icon}</ListItemIcon>
            <ListItemText>{option.label}</ListItemText>
            {preference === option.value && <CheckIcon color="primary" fontSize="small" />}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default ThemeSwitcher;
