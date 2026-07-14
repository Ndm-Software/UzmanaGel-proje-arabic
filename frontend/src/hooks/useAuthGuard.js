// hooks/useAuthGuard.js
import { useState, useEffect } from 'react';
import { auth, db } from '../firebase/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';

export const useAuthGuard = () => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isProvider, setIsProvider] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isPendingProvider, setIsPendingProvider] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setUserRole(null);
        setIsAdmin(false);
        setIsProvider(false);
        setIsClient(false);
        setIsPendingProvider(false);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().userType;
          setUserRole(role);
          setIsAdmin(role === 'ADMIN');
          setIsProvider(role === 'PROVIDER');
          setIsClient(role === 'CLIENT');
          setIsPendingProvider(role === 'PENDING_PROVIDER');
        } else {
          setUserRole('CLIENT');
          setIsAdmin(false);
          setIsProvider(false);
          setIsClient(true);
          setIsPendingProvider(false);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Yetki kontrolü hatası:', error.message);
        }
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { 
    user, 
    userRole, 
    isAdmin, 
    isProvider, 
    isClient, 
    isPendingProvider, 
    isSignedIn: !!user,  
    loading 
  };
};

export const useAdminOnly = () => {
  const { isAdmin, loading } = useAuthGuard();
  const [authorized, setAuthorized] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!loading) {
      if (isAdmin) {
        setAuthorized(true);
        setErrorMessage('');
      } else {
        setErrorMessage('ليست لديك صلاحية الوصول إلى هذه الصفحة. يمكن للمسؤولين فقط الدخول.');
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    }
  }, [isAdmin, loading]);

  return { authorized, loading, errorMessage };
};

export const useProviderOnly = () => {
  const { isProvider, loading, userRole } = useAuthGuard();
  const [authorized, setAuthorized] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!loading) {
      if (isProvider) {
        setAuthorized(true);
        setErrorMessage('');
      } else if (userRole === 'CLIENT' || userRole === 'PENDING_PROVIDER') {
        setErrorMessage('هذه الصفحة مخصصة للخبراء فقط.');
        setTimeout(() => {
          window.location.href = '/ilanlar';
        }, 3000);
      } else {
        setErrorMessage('ليست لديك صلاحية الوصول إلى هذه الصفحة.');
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    }
  }, [isProvider, loading, userRole]);

  return { authorized, loading, errorMessage };
};

export const useClientOnly = () => {
  const { isClient, loading } = useAuthGuard();
  const [authorized, setAuthorized] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!loading) {
      if (isClient) {
        setAuthorized(true);
        setErrorMessage('');
      } else {
        setErrorMessage('هذه الصفحة مخصصة للعملاء فقط.');
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    }
  }, [isClient, loading]);

  return { authorized, loading, errorMessage };
};

export const useAuthRequired = () => {
  const { user, loading } = useAuthGuard();
  const [authorized, setAuthorized] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!loading) {
      if (user) {
        setAuthorized(true);
        setErrorMessage('');
      } else {
        setErrorMessage('يرجى تسجيل الدخول لعرض هذه الصفحة.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      }
    }
  }, [user, loading]);

  return { authorized, loading, errorMessage };
};

export const useIsSignedIn = () => {
  const { isSignedIn, loading } = useAuthGuard();
  return { isSignedIn, loading };
};
