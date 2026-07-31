import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import {
  mapAuthorizedClinics,
  normalizeClinicClaims,
  type ApiClinic,
} from './authSession';

interface SessionUser {
  id: string;
  email: string;
  name?: string;
  photo?: string;
  roles: string[];
  clinicIds: string[];
  getIdToken: () => Promise<string>;
}

interface AuthContextType {
  currentUser: SessionUser | null;
  loading: boolean;
  login: (googleCredential: string) => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

interface AuthProviderProps {
  children: ReactNode;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');
const APICORE_GRAPHQL_URL = (
  import.meta.env.VITE_APICORE_GRAPHQL_URL
  || (API_BASE_URL ? `${API_BASE_URL}/apicore` : '')
).replace(/\/+$/, '');

const GOOGLE_AUTH_MUTATION = `
  mutation Gauth2($token: String!) {
    gauth2(token: $token) {
      token
    }
  }
`;

const ALLOWED_CLINICS_QUERY = `
  query Clinics($where: ClinicWhereInput) {
    clinics(where: $where) {
      id
      logo
      name
      code
      pass
    }
  }
`;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function clearStoredSession() {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('selectedClinicId');
  localStorage.removeItem('availableClinics');
}

async function postApicore<T>(
  query: string,
  variables: Record<string, unknown>,
  idToken?: string,
): Promise<T> {
  if (!APICORE_GRAPHQL_URL) {
    throw new Error('Login API is not configured. Please check VITE_API_BASE.');
  }

  const response = await fetch(APICORE_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('The login service returned an invalid response. Please try again.');
  }

  const payload = await response.json() as GraphqlResponse<T>;
  const apiError = payload.errors?.find((entry) => entry.message)?.message;

  if (!response.ok || apiError) {
    throw new Error(apiError || 'Unable to reach the GreatTime login service.');
  }

  if (!payload.data) {
    throw new Error('The GreatTime login service did not return a result.');
  }

  return payload.data;
}

function normalizeRoles(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function writeAuthorizedClinics(clinics: ReturnType<typeof mapAuthorizedClinics>) {
  const previousClinicId = localStorage.getItem('selectedClinicId');
  const selectedClinicId = clinics.some((clinic) => clinic.id === previousClinicId)
    ? previousClinicId
    : clinics[0]?.id;

  localStorage.removeItem('currentUser');
  localStorage.setItem('availableClinics', JSON.stringify(clinics));
  if (selectedClinicId) {
    localStorage.setItem('selectedClinicId', selectedClinicId);
  } else {
    localStorage.removeItem('selectedClinicId');
  }
}

async function buildSession(firebaseUser: FirebaseUser): Promise<SessionUser> {
  const tokenResult = await firebaseUser.getIdTokenResult();
  const clinicIds = normalizeClinicClaims(tokenResult.claims.clinics);

  if (clinicIds.length === 0) {
    throw new Error('This Google account does not have access to any GreatTime clinic.');
  }

  const data = await postApicore<{ clinics?: ApiClinic[] }>(
    ALLOWED_CLINICS_QUERY,
    {
      where: {
        id: {
          in: clinicIds,
        },
      },
    },
    tokenResult.token,
  );
  const clinics = mapAuthorizedClinics(data.clinics ?? [], clinicIds);

  if (clinics.length === 0) {
    throw new Error('This Google account does not have access to an active GreatTime clinic.');
  }

  writeAuthorizedClinics(clinics);

  return {
    id:
      typeof tokenResult.claims.userId === 'string'
        ? tokenResult.claims.userId
        : firebaseUser.uid,
    email:
      typeof tokenResult.claims.email === 'string'
        ? tokenResult.claims.email
        : firebaseUser.email ?? '',
    name:
      typeof tokenResult.claims.name === 'string'
        ? tokenResult.claims.name
        : firebaseUser.displayName ?? undefined,
    photo:
      typeof tokenResult.claims.photo === 'string'
        ? tokenResult.claims.photo
        : firebaseUser.photoURL ?? undefined,
    roles: normalizeRoles(tokenResult.claims.roles),
    clinicIds,
    getIdToken: () => firebaseUser.getIdToken(),
  };
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const authOperationInProgress = useRef(false);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (authOperationInProgress.current) {
        return;
      }

      if (!firebaseUser) {
        clearStoredSession();
        if (active) {
          setCurrentUser(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      void buildSession(firebaseUser)
        .then((sessionUser) => {
          if (active) {
            setCurrentUser(sessionUser);
          }
        })
        .catch(async (error) => {
          console.error('Unable to restore the Google session:', error);
          clearStoredSession();
          await firebaseSignOut(auth).catch(() => undefined);
          if (active) {
            setCurrentUser(null);
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (googleCredential: string) => {
    authOperationInProgress.current = true;

    try {
      const data = await postApicore<{ gauth2?: { token?: string | null } | null }>(
        GOOGLE_AUTH_MUTATION,
        { token: googleCredential },
      );
      const customToken = data.gauth2?.token;

      if (!customToken) {
        throw new Error('This Google email is not approved for GreatTime BI access.');
      }

      const credential = await signInWithCustomToken(auth, customToken);
      const sessionUser = await buildSession(credential.user);
      setCurrentUser(sessionUser);
    } catch (error) {
      clearStoredSession();
      setCurrentUser(null);
      await firebaseSignOut(auth).catch(() => undefined);
      throw error instanceof Error ? error : new Error('Unable to sign in with Google.');
    } finally {
      authOperationInProgress.current = false;
    }
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      return null;
    }

    try {
      return await firebaseUser.getIdToken();
    } catch (error) {
      console.error('Failed to refresh the Firebase access token:', error);
      return null;
    }
  }, []);

  const signOut = useCallback(async () => {
    authOperationInProgress.current = true;

    try {
      await firebaseSignOut(auth);
      clearStoredSession();
      setCurrentUser(null);
    } catch {
      throw new Error('Sign out failed');
    } finally {
      authOperationInProgress.current = false;
    }
  }, []);

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    getAccessToken,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
