import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import LogoutIcon from '@mui/icons-material/Logout';

// Interface for menu items
interface MenuItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  submenu?: MenuItem[];
  hasSubmenu?: boolean;
  isAiFeature?: boolean;
}

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

  // Save minimized state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('sidebarMinimized', JSON.stringify(isMinimized));
  }, [isMinimized]);
  
  // Close sidebar when screen resizes
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
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
  const menuItems: MenuItem[] = [
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      icon: 'fas fa-tachometer-alt',
      hasSubmenu: true,
      submenu: [
        { id: 'main-dashboard', label: 'Main Dashboard', icon: 'fas fa-home', path: '/dashboard' },
        { id: 'customer-behavior', label: 'Customer Behavior', icon: 'fas fa-chart-bar', path: '/customer-behavior-report' },
        { id: 'service-behavior', label: 'Service Behavior', icon: 'fas fa-spa', path: '/service-behavior-report' },
      ]
    },
    { 
      id: 'appointments', 
      label: 'Appointments', 
      icon: 'fas fa-calendar-alt', 
      hasSubmenu: true,
      submenu: [
        { id: 'appointments-list', label: 'Appointments', icon: 'fas fa-calendar-check', path: '/appointments' },
        { id: 'checkin-out', label: 'CheckIn/Out', icon: 'fas fa-clipboard-check', path: '/check-in-out' },
      ]
    },
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
    { id: 'commission', label: 'Commission', icon: 'fas fa-percentage', path: '/commission' },
  ];

  // AI Feature section
  const aiFeatures: MenuItem[] = [];

  return (
    <>
      {/* Mobile hamburger menu */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button onClick={toggleSidebar} className="text-white p-2 rounded-md bg-gray-800 hover:bg-gray-700">
          <i className="fas fa-bars"></i>
        </button>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40" 
          onClick={toggleSidebar}
        ></div>
      )}

      {/* Sidebar */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 bg-gradient-to-b from-[#151d30] to-[#0c1424] transform transition-all duration-300 ease-in-out 
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
          ${isMinimized ? 'lg:w-16' : 'lg:w-64'} 
          w-[250px] lg:translate-x-0 lg:static lg:inset-0 shadow-xl`}
      >
        <div className="flex flex-col h-full">
          {/* Top section with logo and title */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700/50 bg-gradient-to-r from-[#1a2438] to-[#172033]">
            <div className="flex items-center">
              <div className="text-blue-400 text-xl mr-2">
                <img src="/gtlogo.svg" alt="GreatTime Logo" className="w-6 h-6 drop-shadow-md" />
              </div>
              {!isMinimized && (
                <h1 className="text-white font-semibold text-base drop-shadow-sm">GreatTime Admin</h1>
              )}
            </div>
            
            {/* Close button for mobile */}
            <button 
              onClick={toggleSidebar}
              className="lg:hidden text-gray-400 hover:text-white p-1.5 rounded-full bg-gray-800/50 hover:bg-gray-700/70 transition-colors"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
            
            {/* Minimize/Expand button - visible only on desktop */}
            <button 
              onClick={toggleMinimized} 
              className="hidden lg:flex text-gray-400 hover:text-white p-1.5 rounded-full bg-gray-800/50 hover:bg-gray-700/70 transition-colors"
            >
              {isMinimized ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Menu items */}
          <nav className="flex-1 overflow-y-auto py-3">
            <ul className="space-y-1 px-3">
              {menuItems.map((item) => (
                <li key={item.id}>
                  {item.hasSubmenu ? (
                    <div className="space-y-1">
                      <button
                        onClick={() => toggleSubmenu(item.id)}
                        className={`w-full flex items-center justify-between p-2.5 text-left text-gray-300 hover:bg-[#1e2a40] hover:text-white rounded-md transition-all ${expandedMenus.includes(item.id) ? 'bg-[#1a2438]' : ''} ${isMinimized ? 'justify-center' : ''}`}
                      >
                        <div className={`flex items-center ${isMinimized ? 'justify-center w-full' : ''}`}>
                          <i className={`${item.icon} w-4 h-4 ${isMinimized ? '' : 'mr-3'} ${expandedMenus.includes(item.id) ? 'text-blue-400' : 'text-gray-400'}`}></i>
                          {!isMinimized && (
                            <span className="text-sm">{item.label}</span>
                          )}
                        </div>
                        {!isMinimized && (
                          <i className={`fas fa-chevron-right text-gray-400 text-xs transition-transform duration-200 ${expandedMenus.includes(item.id) ? 'transform rotate-90 text-blue-400' : ''}`}></i>
                        )}
                      </button>
                      
                      {/* Submenu - only show when not minimized or as a popup when minimized and hovered */}
                      {expandedMenus.includes(item.id) && item.submenu && !isMinimized && (
                        <ul className="pl-8 space-y-0.5 mt-1 bg-[#131b2d]/50 rounded-md py-1.5 mx-1">
                          {item.submenu.map((subItem) => (
                            <li key={subItem.id}>
                              <Link
                                to={subItem.path || '#'}
                                className="flex items-center p-2 text-gray-300 hover:bg-[#1e2a40] hover:text-white rounded-md transition-all"
                                onClick={() => window.innerWidth < 1024 && setIsOpen(false)}
                              >
                                <i className={`${subItem.icon} w-4 h-4 mr-2.5 text-gray-500`}></i>
                                <span className="text-xs">{subItem.label}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      
                      {/* Popup submenu for minimized state */}
                      {isMinimized && item.submenu && (
                        <div className="group relative">
                          <div className="absolute left-full top-0 ml-2 w-48 bg-[#1a2438] rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 border border-gray-700/50">
                            <div className="py-1.5 px-1 bg-gradient-to-b from-[#1e2a40] to-[#1a2438] rounded-t-md border-b border-gray-700/50">
                              <div className="text-sm font-medium text-white px-3 py-1.5">{item.label}</div>
                            </div>
                            <ul className="py-1.5">
                              {item.submenu.map((subItem) => (
                                <li key={subItem.id}>
                                  <Link
                                    to={subItem.path || '#'}
                                    className="flex items-center px-4 py-2 text-gray-300 hover:bg-[#242f3d] hover:text-white transition-colors"
                                  >
                                    <i className={`${subItem.icon} w-4 h-4 mr-2.5 text-gray-400`}></i>
                                    <span className="text-xs">{subItem.label}</span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative group">
                      <Link
                        to={item.path || '#'}
                        className={`flex items-center p-2.5 text-gray-300 hover:bg-[#1e2a40] hover:text-white rounded-md transition-all ${
                          item.isAiFeature ? 'bg-gradient-to-r from-blue-900/70 to-blue-800/50 text-blue-100' : ''
                        } ${isMinimized ? 'justify-center' : ''}`}
                        title={isMinimized ? item.label : ''}
                        onClick={() => window.innerWidth < 1024 && setIsOpen(false)}
                      >
                        <i className={`${item.icon} w-4 h-4 ${isMinimized ? '' : 'mr-3'} ${item.isAiFeature ? 'text-blue-400' : 'text-gray-400'}`}></i>
                        {!isMinimized && (
                          <span className={`text-sm ${item.isAiFeature ? 'font-medium' : ''}`}>{item.label}</span>
                        )}
                      </Link>
                      
                      {/* Tooltip for minimized state */}
                      {isMinimized && (
                        <div className="absolute left-full top-0 ml-2 px-3 py-1.5 bg-[#1a2438] text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-lg border border-gray-700/50">
                          {item.label}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Add logout button at the bottom */}
          <div className="mt-auto border-t border-gray-800/30 bg-[#111827]/60">
            <button
              onClick={onLogout}
              className={`flex items-center text-gray-400 hover:text-white w-full px-4 py-3 transition-colors hover:bg-red-900/20 ${isMinimized ? 'justify-center' : ''}`}
            >
              <LogoutIcon className="h-5 w-5 text-red-300/70" />
              {!isMinimized && <span className="ml-2 text-sm">Logout</span>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar; 