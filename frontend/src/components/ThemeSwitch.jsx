import React, { useState, useEffect } from 'react';
import '../styles/ThemeSwitch.css';

const ThemeSwitch = () => {
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark');
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDarkMode ? 'dark' : 'light';
    setIsDarkMode(!isDarkMode);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return (
    <button 
      className="theme-toggle" 
      onClick={toggleTheme}
      aria-label="تغيير المظهر"
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="toggle-icon">☀️</span>
        <span className="toggle-icon">🌙</span>
      </span>
    </button>
  );
};

export default ThemeSwitch;
