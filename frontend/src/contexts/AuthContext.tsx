import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

// Define user type (customize based on your API response)
interface User {
  id: string;
  email: string;
  [key: string]: any; // Flexible for additional user properties
}

// Define context type
interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// Create context with undefined to enforce provider usage
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Custom hook to access context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing user session on mount (e.g., from localStorage)
  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Failed to parse stored user:', error);
      }
    }
    setLoading(false);
  }, []);

  // Login function using REST API
  const login = async (email: string, password: string) => {
    try {
      const query = `mutation GtAuthLogin(
          $username: String!
          $password: String!
          $appType: GTAppType!
        ) {
          gtAuthLogin(username: $username, password: $password, app_type: $appType) {
            user {
              id
              name
              display_name
              clinic {
                id
                name
                logo
                code
                pass
              }
            }
          }
        }
    `;
      const variables = {
        "username": email,
        "password": password,
        "appType": "WEB"
      }

      if (!API_BASE_URL) {
        throw new Error('Login API is not configured. Please check VITE_API_BASE.');
      }

      const response = await fetch(`${API_BASE_URL}/apicore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });

      const responseText = await response.text();
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        throw new Error('Login failed: Invalid credentials');
      }

      if (!contentType.includes('application/json')) {
        throw new Error('Login API returned an invalid response. Please refresh and try again.');
      }

      let payload: { errors?: Array<{ message: string }>, data?: { gtAuthLogin: any } };
      try {
        payload = JSON.parse(responseText);
      } catch {
        throw new Error('Login API returned invalid JSON. Please refresh and try again.');
      }

      const { errors = [], data } = payload;

      if (errors.length > 0) {
        throw new Error(errors[0].message)
      }
      if (data?.gtAuthLogin) {

        const user: User = {
          ...data.gtAuthLogin.user,
          id: data.gtAuthLogin.user.id,
          email: data.gtAuthLogin.user.name,
          clinic: null
        }

        const clinic = data.gtAuthLogin.user.clinic as {
          id: string,
          name: string
          logo: string,
          code: string,
          pass?: string,
        };
        const localClinic: any = {
          id: clinic.code,
          active: 1,
          code: clinic.code,
          logo: clinic.logo,
          name: clinic.name,
        };
        if (clinic.pass) {
          const { id: pass_id } = JSON.parse(clinic.pass) as { id: string }
          localClinic["pass_id"] = pass_id;
        }
        setCurrentUser(user);
        localStorage.setItem('currentUser', JSON.stringify(user)); // Persist user
        localStorage.setItem('selectedClinicId', localClinic.id);
        localStorage.setItem('availableClinics', JSON.stringify([localClinic]));
      }
    } catch (error) {
      throw new Error((error as Error).message || 'Login failed');
    }
  };

  // Sign out function
  const signOut = async () => {
    try {
      setCurrentUser(null);
      localStorage.removeItem('currentUser'); // Clear user session
      localStorage.clear();
    } catch (error) {
      throw new Error('Sign out failed');
    }
  };

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
