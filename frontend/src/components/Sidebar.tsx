import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  ChevronLeft, 
  ChevronRight, 
  Logout as LogoutIcon, 
  AccountBalanceWallet as AccountBalanceWalletIcon,
  Payments as PaymentsIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Menu as MenuIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { 
  ListSubheader, 
  ListItem, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText,
  Box,
  Paper,
  IconButton,
  Tooltip,
  useTheme,
  alpha,
  Divider,
  Button,
  Typography,
  Fab
} from '@mui/material';

// Interface for menu items
interface BaseMenuItem {
  id: string;
  label: string;
  icon: string;
  isAiFeature?: boolean;
}

interface RegularMenuItem extends BaseMenuItem {
  type?: undefined;
  path: string;
  hasSubmenu?: false;
}

interface SubmenuMenuItem extends BaseMenuItem {
  type?: undefined;
  hasSubmenu: true;
  submenu: RegularMenuItem[];
}

interface MenuGroup {
  type: 'group';
  group: string;
  items: {
    text: string;
    icon: React.ReactNode;
    path: string;
  }[];
}

type MenuItem = RegularMenuItem | SubmenuMenuItem;
type MenuItemOrGroup = MenuItem | MenuGroup;

interface SidebarProps {
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
  const [isOpen, setIsOpen] = useState(false); // Default closed on mobile
  const [isMinimized, setIsMinimized] = useState(() => {
    // Initialize from localStorage if available
    const savedState = localStorage.getItem('sidebarMinimized');
    return savedState ? JSON.parse(savedState) : false;
  });
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const location = useLocation();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Save minimized state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('sidebarMinimized', JSON.stringify(isMinimized));
  }, [isMinimized]);
  
  // Close sidebar when screen resizes and handle initial state
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    };
    
    // Set initial state based on screen size
    handleResize();
    
    // Add event listener with passive option for better performance
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle escape key to close mobile sidebar
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen && window.innerWidth < 1024) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Toggle sidebar on mobile
  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  // Toggle minimized state for desktop
  const toggleMinimized = () => {
    setIsMinimized(!isMinimized);
  };

  // Toggle submenu
  const toggleSubmenu = (id: string) => {
    setExpandedMenus(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id) 
        : [...prev, id]
    );
  };

  // Menu items data
  const menuItems: MenuItemOrGroup[] = [
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      icon: 'fas fa-tachometer-alt',
      hasSubmenu: true,
      submenu: [
        { id: 'main-dashboard', label: 'Main Dashboard', icon: 'fas fa-home', path: '/dashboard' },
        { id: 'customer-behavior', label: 'Customer Behavior', icon: 'fas fa-chart-bar', path: '/customer-behavior-report' },
        { id: 'service-behavior', label: 'Service Behavior', icon: 'fas fa-spa', path: '/service-behavior-report' },
        { id: 'taskflow-dashboard', label: 'Taskflow Dashboard', icon: 'fas fa-tasks', path: '/taskflow-dashboard' },
      ]
    },
    { id: 'appointments-list-mysql', label: 'Appointments List', icon: 'fas fa-list', path: '/appointments-list' },
    { id: 'checkin-records', label: 'CheckIn/Out Records', icon: 'fas fa-clipboard-list', path: '/checkin-checkout-page' },
    { id: 'daily-report', label: 'Daily Report', icon: 'fas fa-calendar-day', path: '/daily-report' },
    { id: 'conversational-ai', label: 'Conversational AI', icon: 'fas fa-robot', path: '/conversational-ai', isAiFeature: true },
    { 
      id: 'sales', 
      label: 'Sales', 
      icon: 'fas fa-chart-line',
      hasSubmenu: true,
      submenu: [
        { id: 'payment-details', label: 'Sales Details', icon: 'fas fa-receipt', path: '/payment-details' },
        { id: 'payment-report', label: 'Payment Report', icon: 'fas fa-file-invoice-dollar', path: '/banking-details' },
        { id: 'sales-by-sales-person', label: 'Sales by Sales Person', icon: 'fas fa-user-tag', path: '/sales-by-sales-person' },
        { id: 'customers-by-salesperson', label: 'Customers by Salesperson', icon: 'fas fa-users-cog', path: '/customers-by-salesperson' },
      ]
    },
    { id: 'customers', label: 'Customers', icon: 'fas fa-users', path: '/customers' },
    { id: 'services', label: 'Services', icon: 'fas fa-spa', path: '/services' },
    { 
      id: 'therapists', 
      label: 'Therapists', 
      icon: 'fas fa-user-md',
      hasSubmenu: true,
      submenu: [
        { id: 'therapist-list', label: 'Therapists', icon: 'fas fa-user-md', path: '/therapists' },
        { id: 'helper-list', label: 'Helpers', icon: 'fas fa-hands-helping', path: '/helpers' },
      ]
    },
    // Commission menu item removed
    {
      type: 'group',
      group: 'Wallet',
      items: [
        {
          text: 'Transactions',
          icon: <PaymentsIcon />,
          path: '/transactions'
        },
        {
          text: 'Wallet Accounts',
          icon: <AccountBalanceWalletIcon />,
          path: '/wallet'
        }
      ]
    }
  ];

  // Check if a path is active or part of active submenu
  const isActive = (path: string): boolean => {
    return location.pathname === path;
  };

  // Check if a submenu contains the active path
  const hasActivePath = (submenu: RegularMenuItem[]): boolean => {
    return submenu.some(item => isActive(item.path));
  };

  const renderMenuItem = (item: MenuItemOrGroup) => {
    // Styles for menu items
    const activeItemStyle = { 
      backgroundColor: isDarkMode 
        ? alpha(theme.palette.primary.main, 0.2)  // Slightly higher opacity for better visibility
        : alpha(theme.palette.primary.main, 0.1),
      color: isDarkMode 
        ? '#ffffff'  // Pure white for maximum contrast when active
        : theme.palette.primary.main,
      borderRight: `3px solid ${theme.palette.primary.main}`,
      '&::before': {
        content: '""',
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '3px',
        backgroundColor: theme.palette.primary.main,
      },
    };
    
    const itemTextColor = isDarkMode 
      ? alpha(theme.palette.common.white, 0.85)  // Slightly higher base text contrast
      : theme.palette.text.primary;
    
    const iconColor = isDarkMode 
      ? alpha(theme.palette.common.white, 0.7)
      : theme.palette.primary.main;
    
    const hoverStyle = isDarkMode 
      ? alpha(theme.palette.primary.main, 0.15)  // More noticeable hover
      : alpha(theme.palette.primary.light, 0.2);

    if (item.type === 'group') {
      return (
        <Box key={item.group} sx={{ mt: 2 }}>
          <ListSubheader
            sx={{
              background: 'transparent',
              color: isDarkMode ? alpha(theme.palette.primary.light, 0.9) : theme.palette.primary.dark,
              fontSize: '0.75rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              pb: 1,
              pl: 3
            }}
          >
            {item.group}
          </ListSubheader>
          <Divider 
            sx={{ 
              mb: 1, 
              opacity: 0.2,
              borderColor: isDarkMode ? alpha(theme.palette.divider, 0.3) : undefined 
            }} 
          />
          {item.items.map((subItem) => {
            const isItemActive = isActive(subItem.path);
            
            return (
              <ListItem 
                key={subItem.path} 
                disablePadding
                sx={{ mb: 0.5 }}
              >
                <ListItemButton 
                  component={Link} 
                  to={subItem.path}
                  sx={{
                    py: 1.5,
                    px: 2,
                    ...(isItemActive ? activeItemStyle : {}),
                    '&:hover': {
                      backgroundColor: hoverStyle,
                    },
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: isItemActive ? '0 8px 8px 0' : 0,
                    transition: 'all 0.2s ease-in-out',
                    minHeight: '48px',
                  }}
                >
                  <ListItemIcon 
                    sx={{ 
                      minWidth: isMinimized ? 0 : 40, 
                      color: isItemActive 
                        ? (isDarkMode ? '#ffffff' : theme.palette.primary.main)
                        : iconColor,
                      transition: 'color 0.2s ease-in-out'
                    }}
                  >
                    {subItem.icon}
                  </ListItemIcon>
                  
                  {!isMinimized && (
                    <ListItemText 
                      primary={subItem.text} 
                      primaryTypographyProps={{
                        fontSize: '0.9rem',
                        fontWeight: isItemActive ? 600 : 400,
                        color: isItemActive 
                          ? (isDarkMode ? '#ffffff' : theme.palette.primary.main)
                          : itemTextColor,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    />
                  )}
                </ListItemButton>
              </ListItem>
            );
          })}
        </Box>
      );
    }

    // For items with a submenu (dropdown)
    if (item.hasSubmenu) {
      const isExpanded = expandedMenus.includes(item.id);
      const hasActive = hasActivePath(item.submenu);
      
      return (
        <Box key={item.id} sx={{ mb: 0.5 }}>
          <ListItemButton
            onClick={() => toggleSubmenu(item.id)}
            sx={{
              py: 1.5,
              px: 2,
              color: itemTextColor,
              ...(hasActive ? activeItemStyle : {}),
              '&:hover': {
                backgroundColor: hoverStyle,
              },
              borderRadius: hasActive ? '0 8px 8px 0' : 0,
            }}
          >
            <ListItemIcon 
              sx={{ 
                minWidth: isMinimized ? 0 : 40, 
                color: hasActive 
                  ? (isDarkMode ? '#ffffff' : theme.palette.primary.main)
                  : iconColor
              }}
            >
              <i className={`${item.icon}`} style={{ fontSize: '1.1rem' }} />
            </ListItemIcon>
            
            {!isMinimized && (
              <>
                <ListItemText 
                  primary={item.label} 
                  primaryTypographyProps={{
                    fontSize: '0.9rem',
                    fontWeight: hasActive ? 600 : 400,
                    color: hasActive 
                      ? (isDarkMode ? '#ffffff' : theme.palette.primary.main)
                      : itemTextColor,
                  }}
                />
                {isExpanded ? (
                  <ExpandLessIcon 
                    fontSize="small" 
                    sx={{ 
                      color: hasActive 
                        ? (isDarkMode ? '#ffffff' : theme.palette.primary.main)
                        : iconColor 
                    }} 
                  />
                ) : (
                  <ExpandMoreIcon 
                    fontSize="small" 
                    sx={{ 
                      color: hasActive 
                        ? (isDarkMode ? '#ffffff' : theme.palette.primary.main)
                        : iconColor 
                    }} 
                  />
                )}
              </>
            )}
          </ListItemButton>
          
          {/* Collapsible submenu */}
          {isExpanded && !isMinimized && (
            <Box 
              sx={{ 
                pl: 2,
                overflow: 'hidden',
                transition: 'max-height 0.3s ease',
                maxHeight: isExpanded ? '500px' : '0',
              }}
            >
              {item.submenu.map(subItem => {
                const isSubItemActive = isActive(subItem.path);
                
                return (
                  <ListItemButton
                    key={subItem.id}
                    component={Link}
                    to={subItem.path}
                    sx={{
                      pl: 4,
                      py: 1.2,
                      borderLeft: `1px solid ${isDarkMode 
                        ? alpha(theme.palette.divider, 0.2) 
                        : alpha(theme.palette.divider, 0.5)
                      }`,
                      ...(isSubItemActive ? {
                        backgroundColor: isDarkMode 
                          ? alpha(theme.palette.primary.main, 0.25)
                          : alpha(theme.palette.primary.light, 0.2),
                        borderLeft: `2px solid ${theme.palette.primary.main}`,
                        pl: 'calc(1rem - 1px)',
                      } : {}),
                      '&:hover': {
                        backgroundColor: hoverStyle,
                      },
                      borderRadius: '0 8px 8px 0',
                    }}
                  >
                    <ListItemIcon 
                      sx={{ 
                        minWidth: 32, 
                        color: isSubItemActive 
                          ? (isDarkMode ? '#ffffff' : theme.palette.primary.main)
                          : iconColor
                      }}
                    >
                      <i className={`${subItem.icon}`} style={{ fontSize: '0.9rem' }} />
                    </ListItemIcon>
                    
                    <ListItemText 
                      primary={subItem.label} 
                      primaryTypographyProps={{
                        fontSize: '0.85rem',
                        fontWeight: isSubItemActive ? 600 : 400,
                        color: isSubItemActive 
                          ? (isDarkMode ? '#ffffff' : theme.palette.primary.main) 
                          : itemTextColor,
                      }}
                    />
                  </ListItemButton>
                );
              })}
            </Box>
          )}
        </Box>
      );
    }
    
    // Regular menu item without submenu
    const isItemActive = isActive((item as RegularMenuItem).path);
    
    return (
      <ListItem 
        key={item.id} 
        disablePadding
        sx={{ mb: 0.5 }}
      >
        <ListItemButton
          component={Link}
          to={(item as RegularMenuItem).path}
          sx={{
            py: 1.5,
            px: 2,
            ...(isItemActive ? activeItemStyle : {}),
            '&:hover': {
              backgroundColor: hoverStyle,
            },
            position: 'relative',
            borderRadius: isItemActive ? '0 8px 8px 0' : 0,
            '&::before': isItemActive ? {
              content: '""',
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '3px',
              backgroundColor: theme.palette.primary.main,
            } : {},
          }}
        >
          <ListItemIcon 
            sx={{ 
              minWidth: isMinimized ? 0 : 40, 
              color: isItemActive 
                ? (isDarkMode ? '#ffffff' : theme.palette.primary.main)
                : iconColor 
            }}
          >
            <i className={`${item.icon}`} style={{ fontSize: '1.1rem' }} />
          </ListItemIcon>
          
          {!isMinimized && (
            <ListItemText 
              primary={item.label} 
              primaryTypographyProps={{
                fontSize: '0.9rem',
                fontWeight: isItemActive ? 600 : 400,
                color: isItemActive 
                  ? (isDarkMode ? '#ffffff' : theme.palette.primary.main)
                  : itemTextColor,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            />
          )}
        </ListItemButton>
      </ListItem>
    );
  };

  return (
    <>
      {/* Improved Mobile Toggle Button - Always visible */}
      <Fab
        onClick={toggleSidebar}
        sx={{
          position: 'fixed',
          top: { xs: 16, sm: 20 },
          left: { xs: 16, sm: 20 },
          zIndex: 1300, // Higher than sidebar
          display: { xs: 'flex', lg: 'none' },
          width: { xs: 48, sm: 56 },
          height: { xs: 48, sm: 56 },
          backgroundColor: isDarkMode 
            ? alpha(theme.palette.primary.dark, 0.9)
            : alpha(theme.palette.primary.main, 0.9),
          color: theme.palette.common.white,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(10px)',
          border: `2px solid ${alpha(theme.palette.common.white, 0.1)}`,
          '&:hover': {
            backgroundColor: isDarkMode 
              ? theme.palette.primary.dark
              : theme.palette.primary.main,
            transform: 'scale(1.05)',
            boxShadow: '0 6px 25px rgba(0,0,0,0.4)',
          },
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {isOpen ? <CloseIcon /> : <MenuIcon />}
      </Fab>

      {/* Desktop Toggle Button - Floating on the right edge */}
      <Fab
        onClick={toggleMinimized}
        sx={{
          position: 'fixed',
          top: '50%',
          left: isMinimized ? 70 : 260,
          transform: 'translateY(-50%)',
          zIndex: 1200,
          display: { xs: 'none', lg: 'flex' },
          width: 40,
          height: 40,
          backgroundColor: isDarkMode 
            ? alpha(theme.palette.background.paper, 0.9)
            : alpha(theme.palette.primary.main, 0.9),
          color: isDarkMode 
            ? theme.palette.primary.light
            : theme.palette.common.white,
          boxShadow: '0 2px 15px rgba(0,0,0,0.2)',
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
          '&:hover': {
            backgroundColor: isDarkMode 
              ? alpha(theme.palette.background.paper, 1)
              : theme.palette.primary.main,
            transform: 'translateY(-50%) scale(1.1)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          },
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {isMinimized ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
      </Fab>

      {/* Improved Mobile Overlay */}
      {isOpen && (
        <Box
          onClick={toggleSidebar}
          sx={{
            display: { xs: 'block', lg: 'none' },
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1250, // Between mobile toggle and sidebar
            backdropFilter: 'blur(2px)',
            animation: 'fadeIn 0.3s ease-in-out',
            '@keyframes fadeIn': {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          }}
        />
      )}

      {/* Sidebar */}
      <Box
        component="aside"
        sx={{
          position: {
            xs: 'fixed',
            lg: 'static'
          },
          insetY: 0,
          left: 0,
          zIndex: 1260, // Higher than overlay
          background: isDarkMode 
            ? 'linear-gradient(180deg, #151d30 0%, #0c1424 100%)' 
            : 'linear-gradient(180deg, #f0f5ff 0%, #edf2fc 100%)',
          transform: {
            xs: isOpen ? 'translateX(0)' : 'translateX(-100%)',
            lg: 'none'
          },
          width: {
            xs: '250px',
            lg: isMinimized ? '70px' : '260px'
          },
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 0 20px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          borderRight: isDarkMode 
            ? `1px solid ${alpha(theme.palette.divider, 0.1)}`
            : `1px solid ${alpha(theme.palette.divider, 0.2)}`,
        }}
      >
          {/* Top section with logo and title */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 2,
            borderBottom: `1px solid ${
              isDarkMode 
                ? alpha(theme.palette.divider, 0.1) 
                : alpha(theme.palette.divider, 0.2)
            }`,
            background: isDarkMode 
              ? 'linear-gradient(90deg, #1a2438 0%, #172033 100%)' 
              : 'linear-gradient(90deg, #ffffff 0%, #f8f9ff 100%)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                width: isMinimized ? '30px' : '40px',
                height: isMinimized ? '30px' : '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                background: isDarkMode 
                  ? 'linear-gradient(135deg, #2c3e67 0%, #1e2b4e 100%)' 
                  : 'linear-gradient(135deg, #e1e9ff 0%, #d4deff 100%)',
                boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                color: theme.palette.primary.main,
                fontWeight: 'bold',
                fontSize: isMinimized ? '1rem' : '1.2rem',
              }}
            >
              GT
            </Box>
            
            {!isMinimized && (
              <Box 
                component="h1" 
                sx={{
                  ml: 2,
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  color: isDarkMode ? theme.palette.common.white : theme.palette.text.primary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                GreatTime Admin
              </Box>
            )}
          </Box>
          

        </Box>

        {/* Menu items */}
        <Box 
          component="nav"
          sx={{
            flexGrow: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            px: 1,
            py: 2,
            '&::-webkit-scrollbar': {
              width: '4px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: isDarkMode 
                ? alpha(theme.palette.primary.dark, 0.5) 
                : alpha(theme.palette.primary.light, 0.5),
              borderRadius: '10px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: theme.palette.primary.main,
            },
          }}
        >
          {menuItems.map(renderMenuItem)}
        </Box>

        {/* Logout section */}
        <Box
          sx={{
            borderTop: `1px solid ${
              isDarkMode 
                ? alpha(theme.palette.divider, 0.1) 
                : alpha(theme.palette.divider, 0.2)
            }`,
            p: 2,
            display: 'flex',
            justifyContent: isMinimized ? 'center' : 'flex-start',
          }}
        >
          <Tooltip title={isMinimized ? "Logout" : ""}>
            <span>
              <Button
                onClick={onLogout}
                sx={{
                  color: isDarkMode ? theme.palette.error.light : theme.palette.error.main,
                  backgroundColor: isDarkMode 
                    ? alpha(theme.palette.error.dark, 0.1) 
                    : alpha(theme.palette.error.light, 0.1),
                  borderRadius: '8px',
                  py: 1,
                  px: isMinimized ? 1 : 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isMinimized ? 'center' : 'flex-start',
                  width: isMinimized ? '40px' : '100%',
                  minWidth: isMinimized ? '40px' : 'auto',
                  '&:hover': {
                    backgroundColor: isDarkMode 
                      ? alpha(theme.palette.error.dark, 0.2) 
                      : alpha(theme.palette.error.light, 0.2),
                  }
                }}
              >
                <LogoutIcon sx={{ fontSize: isMinimized ? '1.2rem' : '1rem' }} />
                {!isMinimized && (
                  <Typography 
                    sx={{ 
                      ml: 1, 
                      fontSize: '0.9rem',
                      fontWeight: 'medium',
                    }}
                  >
                    Logout
                  </Typography>
                )}
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </>
  );
};

export default Sidebar; 