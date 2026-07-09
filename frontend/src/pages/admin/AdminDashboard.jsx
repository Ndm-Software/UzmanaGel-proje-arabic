import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase/firebaseClient';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import {
  getPendingExperts,
  getApprovedExperts,
  getAllClients,
} from "../../firebase/adminService";
import LoadingSpinner from "../../components/LoadingSpinner";
import DOMPurify from 'dompurify';
import { useAdminOnly } from '../../hooks/useAuthGuard';
import '../../styles/admin/AdminDashboard.css';

const isDevelopment = process.env.NODE_ENV === 'development';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const sanitizeText = (text, maxLength = 100) => {
  if (!text) return '-';
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + '...' : sanitized;
};

const safeNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

const formatLargeNumber = (num) => {
  const number = safeNumber(num);
  const absNumber = Math.abs(number);
  const sign = number < 0 ? '-' : '';
  const absValue = absNumber;
  
  if (absValue >= 1000000000) {
    return sign + (absValue / 1000000000).toFixed(1).replace(/\.0$/, '') + ' Milyar';
  }
  if (absValue >= 1000000) {
    return sign + (absValue / 1000000).toFixed(1).replace(/\.0$/, '') + ' Milyon';
  }
  if (absValue >= 1000) {
    return sign + (absValue / 1000).toFixed(1).replace(/\.0$/, '') + ' Bin';
  }
  return sign + absValue.toLocaleString('tr-TR');
};

const formatLargePrice = (amount) => {
  const number = safeNumber(amount);
  const absNumber = Math.abs(number);
  const sign = number < 0 ? '-' : '';
  const absValue = absNumber;
  
  if (absValue >= 1000000000) {
    return sign + (absValue / 1000000000).toFixed(1).replace(/\.0$/, '') + ' Milyar ₺';
  }
  if (absValue >= 1000000) {
    return sign + (absValue / 1000000).toFixed(1).replace(/\.0$/, '') + ' Milyon ₺';
  }
  if (absValue >= 1000) {
    return sign + (absValue / 1000).toFixed(1).replace(/\.0$/, '') + ' Bin ₺';
  }
  return sign + absValue.toLocaleString('tr-TR') + ' ₺';
};

const formatFullNumber = (num) => {
  const number = safeNumber(num);
  return number.toLocaleString('tr-TR');
};

const safeFormatPrice = (price) => {
  const num = safeNumber(price);
  return num.toLocaleString('tr-TR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }) + ' ₺';
};

const formatRelativeDate = (dateInput) => {
  if (!dateInput) return '';
  try {
    let date;
    if (dateInput instanceof Date) date = dateInput;
    else if (dateInput?.toDate && typeof dateInput.toDate === 'function') date = dateInput.toDate();
    else if (typeof dateInput === 'string') date = new Date(dateInput);
    else if (typeof dateInput === 'number') date = new Date(dateInput);
    else if (dateInput?.seconds) date = new Date(dateInput.seconds * 1000);
    else return '';
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diff = now - date;
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (diff < 60000) return 'Şimdi';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} dk önce`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} saat önce`;
    if (diffDays === 1) return 'Dün';
    if (diffDays < 7) return `${diffDays} gün önce`;
    return date.toLocaleDateString('tr-TR');
  } catch (error) {
    if (isDevelopment) console.error('formatRelativeDate error:', error);
    return '';
  }
};

export default function AdminDashboard({ onTabChange }) {
  const { authorized, loading: authLoading } = useAdminOnly();
  
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    avgOrder: 0,
    pendingExperts: 0,
    pendingExpertList: [],
    totalExperts: 0,
    totalUsers: 0,
    recentOrders: [],
    todayRegistrations: { total: 0, CLIENT: 0, PROVIDER: 0, PENDING_PROVIDER: 0 },
    todayTokenRevenue: 0,
    recentUsers: [],
    recentMessages: [],
  });

  const [chartData, setChartData] = useState({ labels: [], registrationsData: [] });
  const [chartLoading, setChartLoading] = useState(false);
  const [chartType, setChartType] = useState('weekly');
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedDateTransactions, setSelectedDateTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  useEffect(() => {
    if (authorized) {
      loadDashboardData();
    }
  }, [authorized]);

  useEffect(() => {
    if (authorized) {
      loadChartData();
    }
  }, [chartType, customStartDate, customEndDate, authorized]);

  useEffect(() => {
    if (authorized) {
      loadTransactionsByDate(selectedDate);
    }
  }, [selectedDate, authorized]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const pendingExperts = await getPendingExperts();
      const pendingCount = Array.isArray(pendingExperts) ? pendingExperts.length : 0;
      const pendingExpertList = Array.isArray(pendingExperts) ? pendingExperts : [];

      const approvedExperts = await getApprovedExperts();
      const expertsCount = Array.isArray(approvedExperts) ? approvedExperts.length : 0;

      const users = await getAllClients();
      const usersCount = Array.isArray(users) ? users.length : 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();
      const usersQueryToday = query(collection(db, 'users'), where('createdAt', '>=', todayStr));
      const usersTodaySnap = await getDocs(usersQueryToday);
      const todayRegistrations = { total: 0, CLIENT: 0, PROVIDER: 0, PENDING_PROVIDER: 0 };
      usersTodaySnap.forEach(doc => {
        const userType = doc.data().userType;
        todayRegistrations.total++;
        if (userType === 'CLIENT') todayRegistrations.CLIENT++;
        else if (userType === 'PROVIDER') todayRegistrations.PROVIDER++;
        else if (userType === 'PENDING_PROVIDER') todayRegistrations.PENDING_PROVIDER++;
      });

      const appointmentsQuery = query(
        collection(db, "appointments"), 
        where("status", "==", "completed"),
        limit(500)
      );
      const appointmentsSnap = await getDocs(appointmentsQuery);
      
      let allAppointments = [];
      appointmentsSnap.forEach((doc) => {
        const data = doc.data();
        allAppointments.push({
          id: doc.id,
          client: data.client || "Müşteri",
          expertName: data.expertName || "Uzman",
          date: data.date,
          price: safeNumber(data.price),
          status: data.status,
          approvedTime: data.approvedTime?.toDate?.() || new Date(data.approvedTime)
        });
      });
      
      allAppointments.sort((a, b) => new Date(b.approvedTime) - new Date(a.approvedTime));
      const recentAppointments = allAppointments.slice(0, 100);
      
      let totalRevenue = 0;
      const recentOrders = [];
      recentAppointments.forEach((item) => {
        totalRevenue += item.price;
        recentOrders.push({
          id: item.id,
          client: sanitizeText(item.client, 50),
          expertName: sanitizeText(item.expertName, 50),
          date: item.date ? sanitizeText(item.date, 20) : "-",
          price: item.price,
          status: item.status,
        });
      });

      const avgOrder = recentOrders.length > 0 ? totalRevenue / recentOrders.length : 0;

      const recentUsersSnap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(20)));
      const recentUsers = recentUsersSnap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        displayName: doc.data().displayName || 'İsimsiz',
        email: doc.data().email || '',
        createdAt: doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt),
      }));

      const messagesSnap = await getDocs(query(collection(db, 'contacts'), orderBy('createdAt', 'desc'), limit(10)));
      const recentMessages = messagesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fullName: doc.data().fullName || 'İsimsiz',
        email: doc.data().email || '',
        message: doc.data().message || '',
        createdAt: doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt),
      }));

      const allLoadQuery = query(
        collection(db, 'wallet_history'),
        where('transactionType', '==', 'LOAD'),
        limit(3000)
      );
      const allLoadSnap = await getDocs(allLoadQuery);
      
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      let todayTokenRevenue = 0;
      allLoadSnap.forEach(doc => {
        const data = doc.data();
        const processedAt = data.processedAt?.toDate?.() || new Date(data.processedAt);
        if (processedAt >= todayStart) {
          const amount = safeNumber(data.amountPaid);
          todayTokenRevenue += amount;
        }
      });

      setStats({
        totalRevenue,
        totalOrders: recentAppointments.length,
        avgOrder,
        pendingExperts: pendingCount,
        pendingExpertList,
        totalExperts: expertsCount,
        totalUsers: usersCount,
        recentOrders: recentOrders.slice(0, 10),
        todayRegistrations,
        todayTokenRevenue,
        recentUsers,
        recentMessages,
      });
    } catch (error) {
      if (isDevelopment) console.error("Dashboard verileri yüklenirken hata:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadChartData = async () => {
    try {
      setChartLoading(true);
      let startDate, endDate;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (chartType === 'weekly') {
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        endDate = today;
      } else if (chartType === 'monthly') {
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 30);
        endDate = today;
      } else if (chartType === 'custom' && customStartDate && customEndDate) {
        startDate = customStartDate;
        endDate = customEndDate;
      } else {
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        endDate = today;
      }

      const labels = [];
      const registrationsData = [];

      let currentDate = new Date(startDate);
      const maxDays = 90;
      let dayCount = 0;
      
      while (currentDate <= endDate && dayCount < maxDays) {
        const nextDate = new Date(currentDate);
        nextDate.setDate(currentDate.getDate() + 1);
        labels.push(currentDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }));
        const usersSnap = await getDocs(query(
          collection(db, 'users'), 
          where('createdAt', '>=', currentDate.toISOString()), 
          where('createdAt', '<', nextDate.toISOString())
        ));
        registrationsData.push(usersSnap.size);
        currentDate.setDate(currentDate.getDate() + 1);
        dayCount++;
      }
      setChartData({ labels, registrationsData });
    } catch (error) {
      if (isDevelopment) console.error('Grafik verisi hatası:', error);
    } finally {
      setChartLoading(false);
    }
  };

  const loadTransactionsByDate = async (date) => {
    if (!date) return;
    try {
      setTransactionsLoading(true);
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      const usersSnap = await getDocs(query(
        collection(db, 'users'), 
        where('createdAt', '>=', startDate.toISOString()), 
        where('createdAt', '<=', endDate.toISOString())
      ));
      const users = usersSnap.docs.map(doc => ({ 
        type: 'user', 
        id: doc.id, 
        ...doc.data(),
        displayName: doc.data().displayName || 'İsimsiz',
        email: doc.data().email || '',
        createdAt: doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt)
      }));
      
      const messagesSnap = await getDocs(query(
        collection(db, 'contacts'), 
        where('createdAt', '>=', startDate), 
        where('createdAt', '<=', endDate)
      ));
      const messages = messagesSnap.docs.map(doc => ({ 
        type: 'message', 
        id: doc.id, 
        ...doc.data(),
        fullName: doc.data().fullName || 'İsimsiz',
        userName: doc.data().userName || '',
        email: doc.data().email || '',
        createdAt: doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt) 
      }));
      
      const sorted = [...users, ...messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setSelectedDateTransactions(sorted.slice(0, 100));
    } catch (error) {
      if (isDevelopment) console.error('Tarih sorgusu hatası:', error);
      setSelectedDateTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const handleChartTypeChange = (type) => {
    setChartType(type);
    if (type !== 'custom') {
      setCustomStartDate(null);
      setCustomEndDate(null);
      setShowDatePicker(false);
    }
  };

  const handleViewAllOrders = () => {
    if (onTabChange) {
      onTabChange('appointments', 'completed');
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#e8edf2' } },
      tooltip: { backgroundColor: '#1a1d26', titleColor: '#d4af37', bodyColor: '#e8edf2' }
    },
    scales: {
      y: { grid: { color: '#2d3340' }, ticks: { color: '#8a94a6' } },
      x: { grid: { color: '#2d3340' }, ticks: { color: '#8a94a6' } }
    }
  };

  const chartDataConfig = {
    labels: chartData.labels || [],
    datasets: [{
      label: 'Kayıt Sayısı',
      data: chartData.registrationsData || [],
      backgroundColor: 'rgba(212, 175, 55, 0.5)',
      borderColor: '#d4af37',
      borderWidth: 2,
      type: 'bar',
    }],
  };

  if (authLoading) return <LoadingSpinner text="Yetki kontrol ediliyor..." />;
  if (!authorized) {
    return (
      <div className="no-data">
        <i className="fas fa-shield-alt fa-3x"></i>
        <p>Bu sayfaya erişim yetkiniz yok.</p>
      </div>
    );
  }

  if (loading) return <LoadingSpinner text="Dashboard yükleniyor..." />;

  const recentClients = (stats.recentUsers || [])
    .filter(u => u.userType === 'CLIENT')
    .slice(0, 5)
    .map(user => ({
      ...user,
      displayName: user.displayName || 'İsimsiz Müşteri',
      email: user.email || 'E-posta yok',
      avatar: (user.displayName || '?').charAt(0).toUpperCase()
    }));

  const recentProviders = (stats.recentUsers || [])
    .filter(u => u.userType === 'PROVIDER')
    .slice(0, 5)
    .map(user => ({
      ...user,
      displayName: user.displayName || 'İsimsiz Uzman',
      email: user.email || 'E-posta yok',
      avatar: (user.displayName || '?').charAt(0).toUpperCase()
    }));

  const pendingProviders = (stats.pendingExpertList || [])
    .slice(0, 5)
    .map(expert => ({
      id: expert.id,
      displayName: expert.displayName || expert.businessName || 'İsimsiz Başvuru',
      email: expert.email || 'E-posta yok',
      createdAt: expert.createdAt,
      userType: 'PENDING_PROVIDER',
      avatar: (expert.displayName || expert.businessName || '?').charAt(0).toUpperCase()
    }));

  return (
    <div className="admin-dashboard">
      <div className="stats-grid">
        <div className="stat-card" title={`Tam değer: ${stats.todayRegistrations.total.toLocaleString('tr-TR')} kayıt`}>
          <div className="stat-icon"><i className="fas fa-user-plus"></i></div>
          <div className="stat-info">
            <h3>{stats.todayRegistrations.total.toLocaleString('tr-TR')}</h3>
            <p>Bugün Kaydolanlar</p>
            <div className="stat-breakdown">
              <span className="client">Müşteri: {stats.todayRegistrations.CLIENT}</span>
              <span className="provider">Uzman: {stats.todayRegistrations.PROVIDER}</span>
              <span className="pending">Bekleyen: {stats.todayRegistrations.PENDING_PROVIDER}</span>
            </div>
          </div>
        </div>

        <div className="stat-card" title={`Tam değer: ${formatFullNumber(stats.todayTokenRevenue)} ₺`}>
          <div className="stat-icon"><i className="fas fa-coins"></i></div>
          <div className="stat-info">
            <h3>{formatLargePrice(stats.todayTokenRevenue)}</h3>
            <p>Bugünkü Jeton Satışı</p>
          </div>
        </div>

        <div className="stat-card" title={`Tam değer: ${stats.pendingExperts.toLocaleString('tr-TR')} bekleyen uzman`}>
          <div className="stat-icon"><i className="fas fa-clock"></i></div>
          <div className="stat-info">
            <h3>{stats.pendingExperts.toLocaleString('tr-TR')}</h3>
            <p>Bekleyen Uzman</p>
          </div>
        </div>

        <div className="stat-card" title={`Tam değer: ${stats.totalExperts.toLocaleString('tr-TR')} aktif uzman`}>
          <div className="stat-icon"><i className="fas fa-briefcase"></i></div>
          <div className="stat-info">
            <h3>{stats.totalExperts.toLocaleString('tr-TR')}</h3>
            <p>Aktif Uzman</p>
          </div>
        </div>

        <div className="stat-card" title={`Tam değer: ${stats.totalUsers.toLocaleString('tr-TR')} toplam müşteri`}>
          <div className="stat-icon"><i className="fas fa-users"></i></div>
          <div className="stat-info">
            <h3>{stats.totalUsers.toLocaleString('tr-TR')}</h3>
            <p>Toplam Müşteri</p>
          </div>
        </div>
      </div>

      <div className="chart-section">
        <div className="section-header">
          <h2><i className="fas fa-chart-line"></i> Kayıt Grafikleri</h2>
          <div className="chart-controls">
            <button className={`chart-type-btn ${chartType === 'weekly' ? 'active' : ''}`} onClick={() => handleChartTypeChange('weekly')}>Son 7 Gün</button>
            <button className={`chart-type-btn ${chartType === 'monthly' ? 'active' : ''}`} onClick={() => handleChartTypeChange('monthly')}>Son 30 Gün</button>
          </div>
        </div>

        {chartType === 'custom' && showDatePicker && (
          <div className="custom-date-picker">
            <div className="date-input-group">
              <label>Başlangıç:</label>
              <DatePicker selected={customStartDate} onChange={setCustomStartDate} className="date-input" placeholderText="Seçiniz" />
            </div>
            <div className="date-input-group">
              <label>Bitiş:</label>
              <DatePicker selected={customEndDate} onChange={setCustomEndDate} minDate={customStartDate} className="date-input" placeholderText="Seçiniz" />
            </div>
            <button className="apply-date-btn" onClick={() => { setShowDatePicker(false); loadChartData(); }}>Uygula</button>
          </div>
        )}

        <div className="chart-container">
          {chartLoading ? (
            <div className="chart-loading">Grafik yükleniyor...</div>
          ) : chartData.labels?.length > 0 ? (
            <div style={{ height: '400px' }}>
              <Bar data={chartDataConfig} options={chartOptions} />
            </div>
          ) : (
            <div className="no-data">Henüz grafik verisi yok</div>
          )}
        </div>
      </div>

      <div className="calendar-section">
        <div className="section-header">
          <h2><i className="fas fa-calendar-alt"></i> Tarih Bazlı İşlemler</h2>
          <div className="date-picker-wrapper">
            <DatePicker selected={selectedDate} onChange={setSelectedDate} dateFormat="dd/MM/yyyy" className="date-picker-input" />
            <i className="fas fa-calendar calendar-icon"></i>
          </div>
        </div>

        <div className="transactions-list">
          {transactionsLoading ? (
            <div className="loading-transactions">İşlemler yükleniyor...</div>
          ) : selectedDateTransactions.length === 0 ? (
            <div className="no-data">
              <i className="fas fa-calendar-day"></i>
              <p>{selectedDate.toLocaleDateString('tr-TR')} tarihinde kayıtlı işlem bulunmuyor.</p>
            </div>
          ) : (
            selectedDateTransactions.slice(0, 50).map(transaction => (
              <div key={transaction.id} className="transaction-item">
                <div className="transaction-icon">
                  {transaction.type === 'user' ? (
                    transaction.userType === 'CLIENT' ? <i className="fas fa-user"></i> :
                    transaction.userType === 'PROVIDER' ? <i className="fas fa-briefcase"></i> : <i className="fas fa-clock"></i>
                  ) : (
                    <i className="fas fa-envelope"></i>
                  )}
                </div>
                <div className="transaction-info">
                  <div className="transaction-title">
                    {transaction.type === 'user' ? (
                      <>{sanitizeText(transaction.displayName || 'İsimsiz', 30)} - {transaction.userType === 'CLIENT' ? 'Müşteri Kaydı' : transaction.userType === 'PROVIDER' ? 'Uzman Kaydı' : 'Uzman Başvurusu'}</>
                    ) : (
                      <>İletişim Mesajı: {sanitizeText(transaction.fullName || transaction.userName, 30)}</>
                    )}
                  </div>
                  <div className="transaction-detail">{sanitizeText(transaction.email, 50)}</div>
                </div>
                <div className="transaction-time">{formatRelativeDate(transaction.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="recent-section two-cards">
        <div className="recent-card">
          <div className="section-header">
            <h2><i className="fas fa-clock"></i> Bekleyen Uzmanlar</h2>
            <button className="view-all-btn" onClick={() => onTabChange && onTabChange('pending')}>Tümünü Gör →</button>
          </div>
          <div className="recent-list">
            {pendingProviders.length === 0 ? (
              <div className="no-data">Bekleyen uzman başvurusu yok.</div>
            ) : (
              pendingProviders.map(user => (
                <div key={user.id} className="recent-item">
                  <div className="recent-avatar">{user.avatar}</div>
                  <div className="recent-info">
                    <div className="recent-name">{sanitizeText(user.displayName, 30)}</div>
                    <div className="recent-email">{sanitizeText(user.email, 50)}</div>
                  </div>
                  <div className="recent-badge"><span className="user-type-badge pending">Başvuruda</span></div>
                  <div className="recent-date">{formatRelativeDate(user.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="recent-card">
          <div className="section-header">
            <h2><i className="fas fa-user"></i> Son Müşteriler</h2>
            <button className="view-all-btn" onClick={() => onTabChange && onTabChange('users')}>Tümünü Gör →</button>
          </div>
          <div className="recent-list">
            {recentClients.length === 0 ? (
              <div className="no-data">Henüz müşteri kaydı yok.</div>
            ) : (
              recentClients.map(user => (
                <div key={user.id} className="recent-item">
                  <div className="recent-avatar">{user.avatar}</div>
                  <div className="recent-info">
                    <div className="recent-name">{sanitizeText(user.displayName, 30)}</div>
                    <div className="recent-email">{sanitizeText(user.email, 50)}</div>
                  </div>
                  <div className="recent-badge"><span className="user-type-badge client">Müşteri</span></div>
                  <div className="recent-date">{formatRelativeDate(user.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="recent-section two-cards">
        <div className="recent-card">
          <div className="section-header">
            <h2><i className="fas fa-briefcase"></i> Son Uzmanlar</h2>
            <button className="view-all-btn" onClick={() => onTabChange && onTabChange('experts')}>Tümünü Gör →</button>
          </div>
          <div className="recent-list">
            {recentProviders.length === 0 ? (
              <div className="no-data">Henüz uzman kaydı yok.</div>
            ) : (
              recentProviders.map(user => (
                <div key={user.id} className="recent-item">
                  <div className="recent-avatar">{user.avatar}</div>
                  <div className="recent-info">
                    <div className="recent-name">{sanitizeText(user.displayName, 30)}</div>
                    <div className="recent-email">{sanitizeText(user.email, 50)}</div>
                  </div>
                  <div className="recent-badge"><span className="user-type-badge provider">Uzman</span></div>
                  <div className="recent-date">{formatRelativeDate(user.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="recent-card">
          <div className="section-header">
            <h2><i className="fas fa-envelope"></i> Son Mesajlar</h2>
            <button className="view-all-btn" onClick={() => onTabChange && onTabChange('messages')}>Tümünü Gör →</button>
          </div>
          <div className="recent-list">
            {stats.recentMessages.length === 0 ? (
              <div className="no-data">Henüz mesaj yok.</div>
            ) : (
              stats.recentMessages.slice(0, 5).map(msg => (
                <div key={msg.id} className="recent-item">
                  <div className="recent-avatar">{(msg.fullName || '?').charAt(0).toUpperCase()}</div>
                  <div className="recent-info">
                    <div className="recent-name">{sanitizeText(msg.fullName, 30)}</div>
                    <div className="recent-email">{sanitizeText(msg.email, 50)}</div>
                    <div className="recent-message-preview">{sanitizeText(msg.message, 60)}...</div>
                  </div>
                  <div className="recent-date">{formatRelativeDate(msg.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="section-header">
          <h2>📋 Son Siparişler</h2>
          <button className="view-all-btn" onClick={handleViewAllOrders}>Tümünü Gör →</button>
        </div>
        {stats.recentOrders.length === 0 ? (
          <div className="no-data">Henüz tamamlanmış sipariş yok.</div>
        ) : (
          <div className="orders-table">
            <table>
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th>Uzman</th>
                  <th>Tarih</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{sanitizeText(order.client, 50)}</td>
                    <td>{sanitizeText(order.expertName, 50)}</td>
                    <td>{sanitizeText(order.date, 20)}</td>
                    <td><span className="status-badge completed">Tamamlandı</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}