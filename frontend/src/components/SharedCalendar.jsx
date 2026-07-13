import React, { useState } from 'react';
import DOMPurify from 'dompurify';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const SharedCalendar = ({ selectedDate, onDateSelect, mode = "EXPERT", onWorkloadClick, selectedDates = [], onDatesChange, minDate, enabledDates }) => {
  const [viewDate, setViewDate] = useState(new Date());
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const generateDates = () => {
    const dates = [];
    for (let i = -3; i <= 31; i++) { 
      const d = new Date(viewDate);
      d.setDate(viewDate.getDate() + i);
      d.setHours(0, 0, 0, 0);
      dates.push(d);
    }
    return dates;
  };

  const dates = generateDates();

  const handlePrevMonth = () => {
    const newDate = new Date(viewDate);
    newDate.setMonth(viewDate.getMonth() - 1);
    setViewDate(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(viewDate);
    newDate.setMonth(viewDate.getMonth() + 1);
    setViewDate(newDate);
  };

  const handleGoToday = () => {
    const now = new Date();
    setViewDate(now);
    if (onDateSelect) onDateSelect(now);
  };

  return (
    <div className="shared-calendar-wrapper">
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        
        {mode === "EXPERT" ? (
          <button type="button" onClick={handlePrevMonth} className="settings-primary-button calendar-nav-btn">
            <i className="fas fa-chevron-left"></i> Önceki Ay
          </button>
        ) : (
          <div style={{ width: '100px' }}></div>
        )}
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" onClick={handleGoToday} className="settings-primary-button calendar-today-btn">
            <i className="fas fa-calendar-day"></i> Bugün
          </button>

          {mode === "EXPERT" && (
            <button 
              type="button" 
              onClick={onWorkloadClick} 
              className="settings-primary-button calendar-workload-btn"
            >
              <i className="fas fa-chart-bar"></i> Günün İş Yoğunluğu
            </button>
          )}
        </div>

        <button type="button" onClick={handleNextMonth} className="settings-primary-button calendar-nav-btn">
          Sonraki Ay <i className="fas fa-chevron-right"></i>
        </button>
      </div>

      <div className="dates-grid">
        {dates.map((dateObj, index) => {
          const isToday = dateObj.getTime() === today.getTime();
          const isPast = dateObj.getTime() < today.getTime();
          
          let isBeforeMin = false;
          if (minDate) {
             isBeforeMin = dateObj.getTime() <= new Date(minDate).setHours(0, 0, 0, 0);
          }

          let isSelected = false;
          const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
          
          if (mode === "MULTI_SELECT") {
            isSelected = selectedDates.includes(dateStr);
          } else {
            isSelected = selectedDate && dateObj.getTime() === new Date(selectedDate).setHours(0, 0, 0, 0);
          }

          let isDisabled = (mode === 'CUSTOMER' && isPast) || (mode === 'MULTI_SELECT' && (isPast || isToday || isBeforeMin));

          let isLockedByExpert = false;
          let isHighlighted = false;
          
          if (enabledDates && enabledDates.length > 0) {
            if (!enabledDates.includes(dateStr)) {
              isDisabled = true;
              isLockedByExpert = true;
            } else {
              isHighlighted = true;
            }
          }

          let cardClass = "date-card ";
          if (isToday) cardClass += "is-today ";
          if (isSelected) cardClass += "selected ";
          if (isPast) cardClass += "past-day ";
          if (isDisabled) cardClass += "disabled ";

          const dayNum = dateObj.getDate();
          const monthName = dateObj.toLocaleDateString('tr-TR', { month: 'long' });
          const weekdayName = dateObj.toLocaleDateString('tr-TR', { weekday: 'long' });

          return (
            <div
              key={index}
              className={cardClass}
              style={{ 
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isLockedByExpert ? 0.15 : 1,
                filter: isLockedByExpert ? 'grayscale(100%)' : 'none',
                border: isHighlighted ? '2px solid var(--calendar-highlight-border, #10b981)' : '',
                boxShadow: isHighlighted ? '0 0 15px var(--calendar-highlight-shadow, rgba(16, 185, 129, 0.4))' : 'none',
                transform: isHighlighted ? 'scale(1.05)' : 'scale(1)',
                zIndex: isHighlighted ? 10 : 1,
                transition: 'all 0.3s ease'
              }}
              onClick={() => {
                if (isDisabled) return;

                if (onDateSelect) onDateSelect(dateObj);

                if (mode === "MULTI_SELECT") {
                  if (selectedDates.includes(dateStr)) {
                    onDatesChange(selectedDates.filter(d => d !== dateStr));
                  } else {
                    onDatesChange([...selectedDates, dateStr].sort());
                  }
                }
              }}
            >
              <div className="dc-day-text">{dayNum} {sanitizeText(monthName)}</div>
              <div className="dc-weekday-text">{sanitizeText(weekdayName)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SharedCalendar;