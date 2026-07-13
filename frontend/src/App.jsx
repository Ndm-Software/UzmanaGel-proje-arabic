// frontend/src/App.jsx

import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import KvkkPage from "./pages/KvkkPage";
import AboutPage from "./pages/AboutPage";
import ProfilePage from "./pages/ProfilePage";
import AdPage from "./pages/AdPage";
import FavoritesPage from "./pages/FavoritesPage";
import ListingDetailPage from "./pages/ListingDetailPage";
import ContactPage from "./pages/ContactPage";
import RegisterPhonePage from "./pages/RegisterPhonePage";
import RegisterDetailsPage from "./pages/RegisterDetailsPage";
import LoginPhonePage from "./pages/LoginPhonePage";

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

// Syria Arabic launch: live operation pages are appointment-based, so they are disabled.
// import LiveOperationCenter from "./pages/LiveOperationCenter";
// import LiveServiceTracking from "./pages/LiveServiceTracking";

import AdminPage from "./pages/admin/AdminPage";
import AdminExpertDetailPage from "./pages/admin/AdminExpertDetailPage";

import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import ExpertProtectedRoute from "./components/ExpertProtectedRoute";

// 7 mayis added / Edrees
import IdleSessionTimeout from "./components/IdleSessionTimeout";

function AppRoutes() {
  const location = useLocation();

  const expertOnly = (page) => (
    <ExpertProtectedRoute>
      {page}
    </ExpertProtectedRoute>
  );

  return (
    <div className="route-shell">
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          {/* Ana Sayfalar */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/kvkk" element={<KvkkPage />} />
          <Route path="/hakkımızda" element={<AboutPage />} />
          <Route path="/hakkimizda" element={<AboutPage />} />

          {/* İlanlar */}
          <Route path="/ilanlar" element={<AdPage />} />
          <Route path="/ilan/:listingId" element={<ListingDetailPage />} />
          <Route path="/favoriler" element={<FavoritesPage />} />

          {/* İletişim */}
          <Route path="/iletisim" element={<ContactPage />} />

          {/* Uzman Başvuru - başvuru akışı olduğu için PROVIDER guard yok */}
          <Route path="/uzman-basvuru" element={<ExpertRegisterPage />} />
          <Route
            path="/expert-complete-profile"
            element={<ExpertCompleteProfilePage />}
          />

          {/* Mesajlaşma */}
          <Route path="/mesajlar" element={<MessagingPage />} />

          {/* Uzman Profil */}
          <Route
            path="/uzman-profil"
            element={expertOnly(<ExpertProfilePage />)}
          />

          {/* Public uzman profili - herkes görebilir */}
          <Route
            path="/uzman/:providerId"
            element={<PublicExpertProfilePage />}
          />

          {/* Syria Arabic launch: appointment system routes disabled.
          <Route
            path="/randevu-takvimi"
            element={expertOnly(<AppointmentPage />)}
          />

          <Route path="/customer-appointments" element={<MyAppointments />} />

          <Route
            path="/customer-requests"
            element={expertOnly(<CustomerRequests />)}
          />

          <Route
            path="/request-detail/:date/:id"
            element={expertOnly(<RequestDetailPage />)}
          />

          <Route
            path="/request-detail/:date/:id/forecast"
            element={expertOnly(<RequestForecastPage />)}
          />

          <Route
            path="/customer-appointment/:expertId"
            element={<CustomerAppointmentPage />}
          />
          */}

          {/* Bildirimler */}
          <Route path="/bildirimler" element={<NotificationsPage />} />

          {/* Syria Arabic launch: live service tracking routes disabled with appointment system.
          <Route
            path="/canli-isbasi-merkezi"
            element={expertOnly(<LiveOperationCenter />)}
          />

          <Route
            path="/canli-hizmet-takibi"
            element={<LiveServiceTracking />}
          />
          */}

          {/* Telefon ile Giriş/Kayıt */}
          <Route path="/register-phone" element={<RegisterPhonePage />} />
          <Route path="/register-details" element={<RegisterDetailsPage />} />
          <Route path="/login-phone" element={<LoginPhonePage />} />

          {/* Uzman Panel */}
          <Route
            path="/uzman/ilan-ekle"
            element={expertOnly(<ExpertCreateAdPage />)}
          />

          <Route
            path="/uzman/ilanlarim"
            element={expertOnly(<ExpertMyListingsPage />)}
          />

          <Route
            path="/uzman-bos"
            element={expertOnly(<ExpertBlankPage />)}
          />

          {/* Admin */}
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
        </Routes>
      </AnimatePresence>

      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* 7 mayis added / Edrees - 5 minutes idle session timeout */}
      <IdleSessionTimeout />
      <AppRoutes />
    </BrowserRouter>
  );
}
