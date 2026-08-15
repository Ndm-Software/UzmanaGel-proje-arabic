import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase/firebaseClient';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  doc,
  getDoc
} from 'firebase/firestore';
import Navbar from '../components/Navbar';
import PageTransition from "../components/PageTransition";
import LoadingSpinner from '../components/LoadingSpinner';
import DOMPurify from 'dompurify';
import { useNavigate } from 'react-router-dom';
import { showAppToast } from '../utils/showAppToast';
import '../styles/ContactPage.css';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const ContactPage = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    message: ''
  });

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const loadUserData = async () => {
      setInitializing(true);
      
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        if (user) {
          setIsLoggedIn(true);
          
          try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            
            let displayName = user.displayName || '';
            let email = user.email || '';
            let phoneNumber = user.phoneNumber || '';
            let role = null;
            
            if (userDocSnap.exists()) {
              const userData = userDocSnap.data();
              displayName = userData.displayName || displayName;
              email = userData.email || email;
              role = userData.userType || null;
            }
            
            setUserRole(role);
            setFormData(prev => ({
              ...prev,
              fullName: displayName,
              email: email
            }));
            
          } catch (error) {
            if (isDevelopment) console.error(error.message);
            setFormData(prev => ({
              ...prev,
              fullName: user.displayName || '',
              email: user.email || ''
            }));
          }
        } else {
          setIsLoggedIn(false);
          setUserRole(null);
          setFormData(prev => ({
            ...prev,
            fullName: '',
            email: ''
          }));
        }
        
        setInitializing(false);
      });
      
      return () => unsubscribe();
    };
    
    loadUserData();
  }, []);

  const handleEmailChange = (e) => {
    if (!isLoggedIn) {
      let value = e.target.value;
      value = value.replace(/\s/g, '');
      if (value.length > 100) value = value.slice(0, 100);
      setFormData(prev => ({ ...prev, email: value }));
    }
  };

  const handleNameChange = (e) => {
    if (!isLoggedIn) {
      let value = e.target.value;
      if (value.length > 100) value = value.slice(0, 100);
      setFormData(prev => ({ ...prev, fullName: value }));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (isLoggedIn) {
      if (name === 'message') {
        setFormData(prev => ({ ...prev, [name]: value }));
      }
    } else {
      if (name === 'email') {
        handleEmailChange(e);
      } else if (name === 'fullName') {
        handleNameChange(e);
      } else {
        setFormData(prev => ({ ...prev, [name]: value }));
      }
    }
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isLoggedIn) {
      showAppToast('يرجى تسجيل الدخول لإرسال رسالة.', 'info');
      setTimeout(() => {
        navigate('/login');
      }, 1500);
      return;
    }
    
    setLoading(true);
    setError('');

    if (!formData.fullName.trim()) {
      setError("يرجى إدخال الاسم الكامل.");
      setLoading(false);
      return;
    }

    if (!validateEmail(formData.email)) {
      setError("يرجى إدخال عنوان بريد إلكتروني صالح.");
      setLoading(false);
      return;
    }

    if (formData.message.trim().length < 10) {
      setError("رسالتك قصيرة جداً، يرجى كتابة 10 أحرف على الأقل.");
      setLoading(false);
      return;
    }

    try {
      const now = Date.now();
      const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
      let localSentTimes = [];
      
      let userType = 'REGISTERED_USER';
      let userId = null;
      let finalUserRole = null;

      if (isLoggedIn && auth.currentUser) {
        userId = auth.currentUser.uid;
        finalUserRole = userRole;
      }

      const storageKey = userId 
        ? `contact_sent_timestamps_${userId}`
        : (formData.email ? `contact_sent_timestamps_${formData.email.toLowerCase().trim()}` : 'contact_sent_timestamps_guest');

      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          localSentTimes = JSON.parse(stored).filter(t => t >= twentyFourHoursAgo);
        }
      } catch (e) {
        localSentTimes = [];
      }

      if (localSentTimes.length >= 5) {
        setError("لقد وصلت إلى الحد الأقصى لإرسال الرسائل (5 رسائل في اليوم). يرجى المحاولة مرة أخرى غداً.");
        setLoading(false);
        return;
      }

      await addDoc(collection(db, "contacts"), {
        fullName: sanitizeText(formData.fullName.trim()),
        email: formData.email.toLowerCase().trim(),
        message: sanitizeText(formData.message.trim()),
        createdAt: serverTimestamp(),
        status: "unread",
        userId: userId,
        userType: userType,
        userRole: finalUserRole,
        source: 'registered'
      });

      localSentTimes.push(now);
      localStorage.setItem(storageKey, JSON.stringify(localSentTimes));

      setIsSent(true);
      setFormData(prev => ({ ...prev, message: '' }));

    } catch (err) {
      if (isDevelopment) console.error(err.message);
      setError("تعذر إرسال الرسالة. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <PageTransition>
        <div className="contact-page">
          <Navbar />
          <LoadingSpinner text="جاري تحميل الصفحة..." />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="contact-page">
        <Navbar />
        <main className="contact-container">
          <div className="contact-card">
            {isSent ? (
              <div className="success-content animation-fadeIn">
                <div className="popup-icon"><i className="fas fa-check-circle"></i></div>
                <h3>تم استلام رسالتك!</h3>
                <p>شكرًا لتواصلك معنا. سنرد عليك في أقرب وقت ممكن.</p>
                <button className="submit-button" onClick={() => setIsSent(false)}>إرسال رسالة جديدة</button>
              </div>
            ) : (
              <>
                <div className="contact-icon-wrapper"><i className="fas fa-envelope"></i></div>
                <h2>اتصل بنا</h2>

                <form className="contact-form" onSubmit={handleSubmit}>
                  <div className="input-group">
                    <input 
                      type="text" 
                      name="fullName" 
                      placeholder="الاسم الكامل" 
                      className={`contact-input ${isLoggedIn ? 'disabled-field' : ''}`}
                      required 
                      value={formData.fullName} 
                      onChange={handleChange}
                      disabled={isLoggedIn || loading}
                      readOnly={isLoggedIn}
                      maxLength="100"
                    />
                    {isLoggedIn && (
                      <div className="field-lock-icon">
                        <i className="fas fa-lock"></i>
                      </div>
                    )}
                  </div>
                  
                  <div className="input-group">
                    <input 
                      type="email" 
                      name="email" 
                      placeholder="البريد الإلكتروني" 
                      className={`contact-input ${isLoggedIn ? 'disabled-field' : ''}`}
                      required 
                      value={formData.email} 
                      onChange={handleChange}
                      disabled={isLoggedIn || loading}
                      readOnly={isLoggedIn}
                      maxLength="100"
                    />
                    {isLoggedIn && (
                      <div className="field-lock-icon">
                        <i className="fas fa-lock"></i>
                      </div>
                    )}
                  </div>
                  
                  <textarea                     name="message" 
                    placeholder="رسالتك" 
                    className="contact-input" 
                    required 
                    value={formData.message} 
                    onChange={handleChange}
                    disabled={loading}
                    rows="5"
                    maxLength="2000"
                  ></textarea>

                  {error && <p className="error-message">{sanitizeText(error)}</p>}
                  
                  <button type="submit" className="submit-button" disabled={loading}>
                    {loading ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i>
                        جاري الإرسال...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-paper-plane"></i>
                        إرسال الرسالة
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </main>
      </div>
    </PageTransition>
  );
};

export default ContactPage;