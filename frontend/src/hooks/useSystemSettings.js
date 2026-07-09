// hooks/useSystemSettings.js
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';

export const useSystemSettings = () => {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [registrationsOpen, setRegistrationsOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsRef = doc(db, 'admin_settings', 'site');
        const settingsSnap = await getDoc(settingsRef);
        
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          setMaintenanceMode(data.maintenanceMode || false);
          setRegistrationsOpen(data.registrationsOpen !== false);
        }
      } catch (error) {
        console.error('Sistem ayarları yüklenirken hata:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  return { maintenanceMode, registrationsOpen, loading };
};