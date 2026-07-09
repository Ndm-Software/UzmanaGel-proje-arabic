import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import LoadingSpinner from './LoadingSpinner';
import DOMPurify from 'dompurify';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const ProtectedRoute = ({ children, adminOnly = false, expertOnly = false }) => {
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const user = auth.currentUser;
      
      if (!user) {
        navigate('/login');
        setLoading(false);
        return;
      }

      if (adminOnly) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          
          if (!userDoc.exists()) {
            setErrorMessage('Kullanıcı kaydınız bulunamadı!');
            setTimeout(() => navigate('/'), 3000);
            setLoading(false);
            return;
          }
          
          const userData = userDoc.data();
          
          if (userData.userType === "ADMIN") {
            setIsAuthorized(true);
            setLoading(false);
            return;
          } else {
            setErrorMessage('Bu sayfaya erişim yetkiniz yok! Sadece adminler erişebilir.');
            setTimeout(() => navigate('/'), 3000);
            setLoading(false);
            return;
          }
        } catch (error) {
          if (isDevelopment) console.error('Admin yetki kontrolü hatası:', error.message);
          setErrorMessage('Yetki kontrolü sırasında bir hata oluştu.');
          setTimeout(() => navigate('/'), 3000);
          setLoading(false);
          return;
        }
      }
      
      if (expertOnly) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          
          if (!userDoc.exists()) {
            setErrorMessage('Kullanıcı kaydınız bulunamadı!');
            setTimeout(() => navigate('/'), 3000);
          } else {
            const userData = userDoc.data();
            
            if (userData.userType === 'PROVIDER') {
              setIsAuthorized(true);
            } 
            else if (userData.userType === 'PENDING_PROVIDER') {
              setErrorMessage('Uzman başvurunuz admin onayı bekliyor.');
              setTimeout(() => navigate('/ilanlar'), 3000);  
            }
            else if (userData.userType === 'CLIENT') {
              setErrorMessage('Bu sayfa sadece uzmanlar içindir!');
              setTimeout(() => navigate('/ilanlar'), 3000);
            }
            else {
              setErrorMessage('Bu sayfaya erişim yetkiniz yok!');
              setTimeout(() => navigate('/'), 3000);
            }
          }
        } catch (error) {                            
          if (isDevelopment) console.error('Firestore hatası:', error.message);
          navigate('/');
        }
        setLoading(false);
        return;
      }

      setIsAuthorized(true);
      setLoading(false);
    };

    const unsubscribe = auth.onAuthStateChanged(() => {
      checkAuth();
    });

    return () => unsubscribe();
  }, [navigate, adminOnly, expertOnly]);

  if (loading) return <LoadingSpinner text="Kontrol ediliyor..." />;
  
  if (errorMessage) {
    return (
      <div className="error-container" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        padding: '20px'
      }}>
        <i className="fas fa-exclamation-circle" style={{ fontSize: '48px', color: '#ef4444', marginBottom: '20px' }}></i>
        <h2 style={{ color: 'var(--text-main)', marginBottom: '10px' }}>Erişim Engellendi</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '500px', marginBottom: '20px' }}>{sanitizeText(errorMessage)}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Yönlendiriliyorsunuz...</p>
      </div>
    );
  }
  
  return isAuthorized ? children : null;
};

export default ProtectedRoute;