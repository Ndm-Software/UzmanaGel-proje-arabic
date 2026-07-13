// AdminPage.jsx file code 

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebase/firebaseClient";
import Navbar from "../../components/Navbar";
import AdminDashboard from "./AdminDashboard";
import AdminExperts from "./AdminExperts";
import AdminUsers from "./AdminUsers";
import AdminDeleted from "./AdminDeleted";
import AdminMessages from "./AdminMessages";
import AdminListings from "./AdminListings";
import AdminReportedListings from "./AdminReportedListings";
// Syria Arabic launch: appointment admin page disabled.
// import AdminAppointments from "./AdminAppointments";
import AdminTokenTransactions from "./AdminTokenTransactions";
import AdminPaymentReports from "./AdminPaymentReports";
import AdminSettings from "./AdminSettings";
import AdminAddressRequests from "./AdminAddressRequests";
import {
  getPendingExperts,
  getApprovedExperts,
  getRejectedExperts,
  getAllClients,
  getDeletedProviders,
  getDeletedClients,
  getAdminListingReportsCount,
} from "../../firebase/adminService";
import { useAdminOnly } from "../../hooks/useAuthGuard";
import LoadingSpinner from "../../components/LoadingSpinner";
import DOMPurify from "dompurify";
import "../../styles/admin/admin-common.css";
import "../../styles/admin/AdminSidebar.css";
import "../../styles/admin/AdminCard.css";

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text, maxLength = 100) => {
  if (!text) return "";
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + "..." : sanitized;
};

const sanitizeUrlParam = (param) => {
  if (!param) return null;
  return String(param).replace(/[<>]/g, '').slice(0, 100);
};

const validTabs = [
  "dashboard", "pending", "experts", "rejected", "users",
  "messages", "listings", "reportedListings",
  // "appointments",
  "deletedProviders",
  "deletedClients", "tokenTransactions", "paymentReports", "settings",
  "addressRequests"
];

const validFilters = ["completed"];

export default function AdminPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { authorized, loading: authLoading } = useAdminOnly();
  
  const [activeTab, setActiveTab] = useState(() => {
    const tabFromUrl = searchParams.get("tab");
    const sanitizedTab = sanitizeUrlParam(tabFromUrl);
    return validTabs.includes(sanitizedTab) ? sanitizedTab : "listings";
  });

  const [appointmentsFilter, setAppointmentsFilter] = useState(null);

  const [counts, setCounts] = useState({
    pending: 0,
    experts: 0,
    rejected: 0,
    users: 0,
    deletedProviders: 0,
    deletedClients: 0,
    addressRequests: 0,
    listingReports: 0,
  });

  const handleTabChange = (tab, filter = null) => {
    const sanitizedTab = sanitizeUrlParam(tab);
    if (!validTabs.includes(sanitizedTab)) return;
    
    setActiveTab(sanitizedTab);
    
    const sanitizedFilter = filter ? sanitizeUrlParam(filter) : null;
    if (sanitizedFilter && validFilters.includes(sanitizedFilter)) {
      setAppointmentsFilter(sanitizedFilter);
      setSearchParams({ tab: sanitizedTab, filter: sanitizedFilter });
    } else {
      setAppointmentsFilter(null);
      setSearchParams({ tab: sanitizedTab });
    }
  };

  useEffect(() => {
    const filterFromUrl = searchParams.get("filter");
    const sanitizedFilter = sanitizeUrlParam(filterFromUrl);
    if (sanitizedFilter === "completed" && validFilters.includes(sanitizedFilter) && activeTab === "appointments") {
      setAppointmentsFilter(sanitizedFilter);
    } else {
      setAppointmentsFilter(null);
    }
  }, [searchParams, activeTab]);

  const refreshListingReportsCount = useCallback(async () => {
    try {
      const payload = await getAdminListingReportsCount().catch(() => ({ count: 0 }));
      const n = typeof payload?.count === "number" ? payload.count : 0;
      setCounts((c) => ({ ...c, listingReports: n }));
    } catch (error) {
      if (isDevelopment) console.error("Bildirilen ilan rozeti güncellenemedi:", error?.message || error);
    }
  }, []);

  useEffect(() => {
    const loadCounts = async () => {
      if (!authorized) return;
      
      try {
        const [
          pending,
          experts,
          rejected,
          users,
          deletedProviders,
          deletedClients,
          addressRequestsSnap,
          listingReportsCountPayload,
        ] = await Promise.all([
          getPendingExperts(),
          getApprovedExperts(),
          getRejectedExperts(),
          getAllClients(),
          getDeletedProviders(),
          getDeletedClients(),
          getDocs(query(collection(db, "address_change_requests"), where("status", "==", "PENDING"))),
          getAdminListingReportsCount().catch(() => ({ count: 0 })),
        ]);

        setCounts({
          pending: Array.isArray(pending) ? pending.length : 0,
          experts: Array.isArray(experts) ? experts.length : 0,
          rejected: Array.isArray(rejected) ? rejected.length : 0,
          users: Array.isArray(users) ? users.length : 0,
          deletedProviders: Array.isArray(deletedProviders) ? deletedProviders.length : 0,
          deletedClients: Array.isArray(deletedClients) ? deletedClients.length : 0,
          addressRequests: addressRequestsSnap.size,
          listingReports:
            typeof listingReportsCountPayload?.count === "number"
              ? listingReportsCountPayload.count
              : 0,
        });
      } catch (error) {
        if (isDevelopment) console.error("Sayılar yüklenirken hata:", error.message);
      }
    };
    
    if (authorized) {
      loadCounts();
    }
  }, [authorized]);

  useEffect(() => {
    if (!authorized || activeTab !== "reportedListings") return;
    refreshListingReportsCount();
  }, [activeTab, authorized, refreshListingReportsCount]);

  if (authLoading) {
    return (
      <div className="admin-page">
        <Navbar />
        <div style={{ minHeight: 'calc(100vh - 80px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner text="جاري التحقق من الصلاحيات..." />
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="admin-page">
        <Navbar />
        <div className="admin-container">
          <div className="no-data" style={{ textAlign: "center", padding: "60px" }}>
            <i className="fas fa-shield-alt fa-3x" style={{ marginBottom: "20px", opacity: 0.5 }}></i>
            <h2 style={{ color: "var(--text-main)", marginBottom: "10px" }}>تم رفض الوصول</h2>
            <p style={{ color: "var(--text-muted)" }}>
              ليس لديك صلاحية للوصول إلى هذه الصفحة. يمكن للمسؤولين فقط الوصول.
            </p>
            <button 
              onClick={() => navigate("/")} 
              style={{ marginTop: "20px", padding: "10px 24px", background: "var(--primary)", border: "none", borderRadius: "8px", cursor: "pointer" }}
            >
              العودة إلى الصفحة الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <AdminDashboard onTabChange={handleTabChange} />;
      case "pending":
        return <AdminExperts type="pending" />;
      case "experts":
        return <AdminExperts type="approved" />;
      case "rejected":
        return <AdminExperts type="rejected" />;
      case "users":
        return <AdminUsers />;
      case "messages":
        return <AdminMessages />;
      case "listings":
        return <AdminListings />;
      case "reportedListings":
        return (
          <AdminReportedListings onSidebarCountsRefresh={refreshListingReportsCount} />
        );
      // Syria Arabic launch: appointment admin page disabled.
      // case "appointments":
      //   return <AdminAppointments initialFilter={appointmentsFilter} />;
      case "deletedProviders":
        return <AdminDeleted type="providers" />;
      case "deletedClients":
        return <AdminDeleted type="clients" />;
      case "tokenTransactions":
        return <AdminTokenTransactions />;
      case "paymentReports":
        return <AdminPaymentReports />;
      case "settings":
        return <AdminSettings />;
      case "addressRequests":
        return <AdminAddressRequests />;
      default:
        return <AdminDashboard onTabChange={handleTabChange} />;
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case "dashboard": return "لوحة التحكم";
      case "pending": return "طلبات انضمام الخبراء المعلقة";
      case "experts": return "جميع الخبراء";
      case "rejected": return "الخبراء المرفوضين";
      case "users": return "جميع المستخدمين";
      case "messages": return "الرسائل";
      case "listings": return "جميع الإعلانات";
      case "reportedListings": return "الإعلانات المبلغ عنها";
      case "appointments": return "طلبات العملاء";
      case "deletedProviders": return "حسابات الخبراء المحذوفة";
      case "deletedClients": return "حسابات المستخدمين المحذوفة";
      case "tokenTransactions": return "عمليات الرموز (Jeton)";
      case "paymentReports": return "تقارير الدفع";
      case "settings": return "إعدادات النظام";
      case "addressRequests": return "طلبات تغيير العنوان";
      default: return "لوحة التحكم للأدمن";
    }
  };

  return (
    <div className="admin-page">
      <Navbar />
      <div className="admin-container">
        <aside className="admin-sidebar">
          <h3>لوحة التحكم للأدمن</h3>
          <nav>
            <div className="sidebar-divider">📋 إدارة الإعلانات</div>

            <button
              className={`nav-link ${activeTab === "listings" ? "active" : ""}`}
              onClick={() => handleTabChange("listings")}
            >
              <i className="fas fa-ad"></i> جميع الإعلانات
            </button>

            <div className="sidebar-divider">👥 إدارة الخبراء</div>

            <button
              className={`nav-link ${activeTab === "experts" ? "active" : ""}`}
              onClick={() => handleTabChange("experts")}
            >
              <i className="fas fa-briefcase"></i> جميع الخبراء
              <span className="nav-count">{counts.experts}</span>
            </button>

            <div className="sidebar-divider">👤 إدارة المستخدمين</div>

            <button
              className={`nav-link ${activeTab === "users" ? "active" : ""}`}
              onClick={() => handleTabChange("users")}
            >
              <i className="fas fa-users"></i> المستخدمين
              <span className="nav-count">{counts.users}</span>
            </button>

            <button
              className={`nav-link ${activeTab === "messages" ? "active" : ""}`}
              onClick={() => handleTabChange("messages")}
            >
              <i className="fas fa-envelope"></i> الرسائل
            </button>

            <div className="sidebar-divider">🗑️ إدارة المحذوفات</div>

            <button
              className={`nav-link ${activeTab === "deletedProviders" ? "active" : ""}`}
              onClick={() => handleTabChange("deletedProviders")}
            >
              <i className="fas fa-trash-restore"></i> الخبراء المحذوفين
              <span className="nav-count">{counts.deletedProviders}</span>
            </button>

            <button
              className={`nav-link ${activeTab === "deletedClients" ? "active" : ""}`}
              onClick={() => handleTabChange("deletedClients")}
            >
              <i className="fas fa-user-clock"></i> المستخدمين المحذوفين
              <span className="nav-count">{counts.deletedClients}</span>
            </button>

            <div className="sidebar-divider">⚙️ النظام</div>

            <button
              className={`nav-link ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => handleTabChange("settings")}
            >
              <i className="fas fa-cog"></i> الإعدادات
            </button>
          </nav>
        </aside>

        <main className="admin-content">
          <div className="admin-header">
            <h1>{sanitizeText(getPageTitle(), 50)}</h1>
          </div>
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

/*
Archived elements removed for Syrian Launch:
            <button
              className={`nav-link ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => handleTabChange("dashboard")}
            >
              <i className="fas fa-chart-line"></i> Dashboard
            </button>

            <div className="sidebar-divider">👥 Uzman Yönetimi</div>

            <button
              className={`nav-link ${activeTab === "pending" ? "active" : ""}`}
              onClick={() => handleTabChange("pending")}
            >
              <i className="fas fa-clock"></i> Onay Bekleyenler
              <span className="nav-count">{counts.pending}</span>
            </button>

            <button
              className={`nav-link ${activeTab === "rejected" ? "active" : ""}`}
              onClick={() => handleTabChange("rejected")}
            >
              <i className="fas fa-times-circle"></i> Reddedilen Uzmanlar
              <span className="nav-count">{counts.rejected}</span>
            </button>

            <div className="sidebar-divider">📍 Adres Yönetimi</div>

            <button
              className={`nav-link ${activeTab === "addressRequests" ? "active" : ""}`}
              onClick={() => handleTabChange("addressRequests")}
            >
              <i className="fas fa-map-marker-alt"></i> Adres Değişiklik Talepleri
              {counts.addressRequests > 0 && (
                <span className="nav-count">{counts.addressRequests}</span>
              )}
            </button>

            <button
              className={`nav-link ${activeTab === "reportedListings" ? "active" : ""}`}
              onClick={() => handleTabChange("reportedListings")}
            >
              <i className="fas fa-flag"></i> Bildirilen İlanlar
              {counts.listingReports > 0 && (
                <span className="nav-count">{counts.listingReports}</span>
              )}
            </button>

            <div className="sidebar-divider">📅 Randevu Yönetimi</div>

            <button
              className={`nav-link ${activeTab === "appointments" ? "active" : ""}`}
              onClick={() => handleTabChange("appointments")}
            >
              <i className="fas fa-calendar-check"></i> Müşteri Talepleri
            </button>

            <div className="sidebar-divider">💰 Finans Yönetimi</div>

            <button
              className={`nav-link ${activeTab === "tokenTransactions" ? "active" : ""}`}
              onClick={() => handleTabChange("tokenTransactions")}
            >
              <i className="fas fa-coins"></i> Jeton İşlemleri
            </button>

            <button
              className={`nav-link ${activeTab === "paymentReports" ? "active" : ""}`}
              onClick={() => handleTabChange("paymentReports")}
            >
              <i className="fas fa-chart-pie"></i> Ödeme Raporları
            </button>
*/
