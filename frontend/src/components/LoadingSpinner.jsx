import React from 'react';
import DOMPurify from 'dompurify';
import '../styles/LoadingSpinner.css';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const LoadingSpinner = ({ text = 'جاري التحميل، يرجى الانتظار...' }) => {
  return (
    <div className="loader-container">
      <div className="loader-wrapper">
        <div className="loader-circle">
          <div className="loader-spinner"></div>
        </div>
        <div className="loader-logo">
          <span className="loader-logo-text">خبير</span>
        </div>
      </div>
      <p className="loader-text">{sanitizeText(text)}</p>
    </div>
  );
};

export default LoadingSpinner;
