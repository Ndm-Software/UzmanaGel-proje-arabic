// frontend/src/App.jsx

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import { AnimatePresence } from "framer-motion";

import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import KvkkPage from "./pages/KvkkPage";
import AboutPage from "./pages/AboutPage";
import FAQPage from "./pages/FAQPage";
import ProfilePage from "./pages/ProfilePage";
import AdPage from "./pages/AdPage";
import FavoritesPage from "./pages/FavoritesPage";
import ListingDetailPage from "./pages/ListingDetailPage";
import ContactPage from "./pages/ContactPage";

import ExpertBlankPage from "./pages/ExpertBlankPage";
import ExpertCreateAdPage from "./pages/ExpertCreateAdPage";
import ExpertRegisterPage from "./pages/ExpertRegisterPage";
import ExpertProfilePage from "./pages/ExpertProfilePage";
import ExpertCompleteProfilePage from "./pages/ExpertCompleteProfilePage";
import ExpertMyListingsPage from "./pages/ExpertMyListingsPage";
import PublicExpertProfilePage from "./pages/PublicExpertProfilePage";

import MessagingPage from "./pages/MessagingPage";

// Syria Arabic launch: appointment system routes disabled.
// import AppointmentPage from "./pages/AppointmentPage";

import NotificationsPage from "./pages/NotificationsPage";

// import MyAppointments from "./pages/MyAppointments";
// import CustomerAppointmentPage from "./pages/CustomerAppointmentPage";
// import CustomerRequests from "./pages/CustomerRequests";
// import RequestDetailPage from "./pages/RequestDetailPage";
// import RequestForecastPage from "./pages/RequestForecastPage";

// Syria Arabic launch: live operation pages are appointment-based,
// so they are disabled.
// import LiveOperationCenter from "./pages/LiveOperationCenter";
// import LiveServiceTracking from "./pages/LiveServiceTracking";

import AdminPage from "./pages/admin/AdminPage";
import AdminExpertDetailPage from "./pages/admin/AdminExpertDetailPage";

import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import ExpertProtectedRoute from "./components/ExpertProtectedRoute";

import IdleSessionTimeout from "./components/IdleSessionTimeout";

function AppRoutes() {
  const location = useLocation();

  const expertOnly = (page) => (
    <ExpertProtectedRoute>{page}</ExpertProtectedRoute>
  );

  return (
    <div className="route-shell">
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          {/* =========================
              الصفحات الأساسية
          ========================== */}

          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/ملفي" element={<ProfilePage />} />
          <Route path="/kvkk" element={<KvkkPage />} />

          {/* من نحن */}
          <Route path="/من-نحن" element={<AboutPage />} />

          {/* الأسئلة الشائعة */}
          <Route path="/الأسئلة-الشائعة" element={<FAQPage />} />

          {/* تحويل روابط قديمة */}
          <Route path="/faq" element={<Navigate to="/الأسئلة-الشائعة" replace />} />

          {/* تحويل الروابط التركية القديمة */}
          <Route
            path="/hakkimizda"
            element={<Navigate to="/من-نحن" replace />}
          />

          <Route
            path="/hakkımızda"
            element={<Navigate to="/من-نحن" replace />}
          />

          {/* =========================
              الإعلانات
          ========================== */}

          <Route path="/الإعلانات" element={<AdPage />} />

          <Route
            path="/إعلان/:listingId"
            element={<ListingDetailPage />}
          />

          <Route path="/المفضلة" element={<FavoritesPage />} />

          {/* تحويل الروابط التركية القديمة */}

          <Route
            path="/ilanlar"
            element={<Navigate to="/الإعلانات" replace />}
          />

          <Route
            path="/ilan/:listingId"
            element={<LegacyListingRedirect />}
          />

          <Route
            path="/favoriler"
            element={<Navigate to="/المفضلة" replace />}
          />

          {/* =========================
              التواصل
          ========================== */}

          <Route path="/اتصل-بنا" element={<ContactPage />} />

          <Route
            path="/iletisim"
            element={<Navigate to="/اتصل-بنا" replace />}
          />

          {/* =========================
              تسجيل الخبير
          ========================== */}

          <Route
            path="/تسجيل-خبير"
            element={<ExpertRegisterPage />}
          />

          <Route
            path="/إكمال-ملف-الخبير"
            element={<ExpertCompleteProfilePage />}
          />

          {/* تحويل الروابط القديمة */}

          <Route
            path="/uzman-basvuru"
            element={<Navigate to="/تسجيل-خبير" replace />}
          />

          <Route
            path="/expert-complete-profile"
            element={<Navigate to="/إكمال-ملف-الخبير" replace />}
          />

          {/* =========================
              الرسائل
          ========================== */}

          <Route path="/الرسائل" element={<MessagingPage />} />

          <Route
            path="/mesajlar"
            element={<Navigate to="/الرسائل" replace />}
          />

          {/* =========================
              الملف الشخصي للخبير
          ========================== */}

          <Route
            path="/ملف-الخبير"
            element={expertOnly(<ExpertProfilePage />)}
          />

          <Route
            path="/uzman-profil"
            element={<Navigate to="/ملف-الخبير" replace />}
          />

          {/* الملف العام للخبير */}

          <Route
            path="/خبير/:providerId"
            element={<PublicExpertProfilePage />}
          />

          <Route
            path="/uzman/:providerId"
            element={<LegacyExpertRedirect />}
          />

          {/* =========================
              نظام المواعيد معطّل
          ========================== */}

          {/*
          <Route
            path="/تقويم-المواعيد"
            element={expertOnly(<AppointmentPage />)}
          />

          <Route
            path="/مواعيدي"
            element={<MyAppointments />}
          />

          <Route
            path="/طلبات-العملاء"
            element={expertOnly(<CustomerRequests />)}
          />

          <Route
            path="/تفاصيل-الطلب/:date/:id"
            element={expertOnly(<RequestDetailPage />)}
          />

          <Route
            path="/تفاصيل-الطلب/:date/:id/التوقعات"
            element={expertOnly(<RequestForecastPage />)}
          />

          <Route
            path="/حجز-موعد/:expertId"
            element={<CustomerAppointmentPage />}
          />
          */}

          {/* =========================
              الإشعارات
          ========================== */}

          <Route
            path="/الإشعارات"
            element={<NotificationsPage />}
          />

          <Route
            path="/bildirimler"
            element={<Navigate to="/الإشعارات" replace />}
          />

          {/* =========================
              نظام المتابعة المباشرة معطّل
          ========================== */}

          {/*
          <Route
            path="/مركز-العمليات-المباشر"
            element={expertOnly(<LiveOperationCenter />)}
          />

          <Route
            path="/تتبع-الخدمة-المباشر"
            element={<LiveServiceTracking />}
          />
          */}

          {/* =========================
              لوحة الخبير
          ========================== */}

          <Route
            path="/خبير/إضافة-إعلان"
            element={expertOnly(<ExpertCreateAdPage />)}
          />

          <Route
            path="/خبير/إعلاناتي"
            element={expertOnly(<ExpertMyListingsPage />)}
          />

          <Route
            path="/صفحة-الخبير"
            element={expertOnly(<ExpertBlankPage />)}
          />

          {/* تحويل روابط لوحة الخبير القديمة */}

          <Route
            path="/uzman/ilan-ekle"
            element={<Navigate to="/خبير/إضافة-إعلان" replace />}
          />

          <Route
            path="/uzman/ilanlarim"
            element={<Navigate to="/خبير/إعلاناتي" replace />}
          />

          <Route
            path="/uzman-bos"
            element={<Navigate to="/صفحة-الخبير" replace />}
          />

          {/* =========================
              الإدارة
          ========================== */}

          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly={true}>
                <AdminPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/expert/:expertId"
            element={
              <ProtectedRoute adminOnly={true}>
                <AdminExpertDetailPage />
              </ProtectedRoute>
            }
          />

          {/* أي رابط غير موجود يعيد المستخدم للرئيسية */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>

      <Footer />
    </div>
  );
}

/*
  تحويل رابط الإعلان القديم:
  /ilan/123
  إلى:
  /إعلان/123
*/
function LegacyListingRedirect() {
  const location = useLocation();
  const listingId = location.pathname.split("/").filter(Boolean).pop();

  return <Navigate to={`/إعلان/${listingId}`} replace />;
}

/*
  تحويل رابط الخبير القديم:
  /uzman/USER_ID
  إلى:
  /خبير/USER_ID
*/
function LegacyExpertRedirect() {
  const location = useLocation();
  const providerId = location.pathname.split("/").filter(Boolean).pop();

  return <Navigate to={`/خبير/${providerId}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* 5 minutes idle session timeout */}
      <IdleSessionTimeout />

      <AppRoutes />
    </BrowserRouter>
  );
}