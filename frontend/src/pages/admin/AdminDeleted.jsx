// AdminDeleted.jsx file code

import React, { useState, useEffect } from "react";
import {
  getDeletedProviders,
  restoreDeletedProvider,
  getDeletedClients,
  restoreDeletedClient,
} from "../../firebase/adminService";
import LoadingSpinner from "../../components/LoadingSpinner";
import DeletedProviderCard from "../../components/admin/DeletedProviderCard";
import DeletedClientCard from "../../components/admin/DeletedClientCard";
import DOMPurify from "dompurify";
import { useAdminOnly } from "../../hooks/useAuthGuard";
import "../../styles/admin/admin-common.css";
import "../../styles/admin/AdminCard.css";

const isDevelopment = process.env.NODE_ENV === "development";

const sanitizeText = (text, maxLength = 200) => {
  if (!text) return "";
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength
    ? sanitized.slice(0, maxLength) + "..."
    : sanitized;
};

const getRestoredLoginMethodText = (method) => {
  switch (method) {
    case "google":
      return "Google ile giriş";
    case "password":
      return "Şifre ile giriş";
    case "phone":
      return "Telefon ile giriş";
    case "multiple":
      return "Mevcut giriş yöntemleri";
    case "password_recovery_for_google":
      return "Geçici şifre ile giriş (Google yeniden bağlanmalı)";
    case "existing_credentials":
      return "Mevcut giriş bilgileri";
    default:
      return "-";
  }
};

export default function AdminDeleted({ type }) {
  const {
    authorized,
    loading: authLoading,
    errorMessage: authError,
  } = useAdminOnly();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState(null);
  const [restoreLoadingId, setRestoreLoadingId] = useState(null);

  const [restoreConfirmModal, setRestoreConfirmModal] = useState({
    open: false,
    account: null,
    accountName: "",
  });

  const [restoreSuccessModal, setRestoreSuccessModal] = useState({
    open: false,
    accountName: "",
    tempPassword: "",
    restoredListingsCount: 0,
    type: "",
    restoredLoginMethod: "",
    pendingGoogleRelink: false,
  });

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (authorized) {
      loadItems();
    }
  }, [type, authorized]);

  const showSuccessModalFunc = (message) => {
    setSuccessMessage(sanitizeText(message, 200));
    setShowSuccessModal(true);
    setTimeout(() => setShowSuccessModal(false), 3000);
  };

  const showErrorModalFunc = (message) => {
    setErrorMessage(sanitizeText(message, 200));
    setShowErrorModal(true);
    setTimeout(() => setShowErrorModal(false), 4000);
  };

  const loadItems = async () => {
    setLoading(true);

    try {
      let data = [];

      if (type === "providers") {
        data = await getDeletedProviders();
      } else if (type === "clients") {
        data = await getDeletedClients();
      }

      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      if (isDevelopment) {
        console.error("Silinen hesaplar yüklenirken hata:", error.message);
      }

      showErrorModalFunc("Silinen hesaplar yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const openRestoreConfirmModal = (account) => {
    const accountName = sanitizeText(
      account?.userData?.displayName ||
        account?.providerData?.businessName ||
        account?.id ||
        "Hesap",
      80
    );

    setRestoreConfirmModal({
      open: true,
      account,
      accountName,
    });
  };

  const closeRestoreConfirmModal = () => {
    if (restoreLoadingId) return;

    setRestoreConfirmModal({
      open: false,
      account: null,
      accountName: "",
    });
  };

  const confirmRestoreDeletedAccount = async () => {
    if (!restoreConfirmModal.account) {
      showErrorModalFunc("Geçersiz hesap bilgisi");
      return;
    }

    const account = restoreConfirmModal.account;

    setRestoreConfirmModal({
      open: false,
      account: null,
      accountName: "",
    });

    await handleRestoreDeletedAccount(account);
  };

  const handleRestoreDeletedAccount = async (account) => {
    if (!account?.id) {
      showErrorModalFunc("Geçersiz hesap bilgisi");
      return;
    }

    try {
      setRestoreLoadingId(account.id);

      const result =
        type === "providers"
          ? await restoreDeletedProvider(account.id)
          : await restoreDeletedClient(account.id);

      setItems((prev) => prev.filter((item) => item.id !== account.id));

      setRestoreSuccessModal({
        open: true,
        accountName: sanitizeText(
          account.userData?.displayName ||
            account.providerData?.businessName ||
            account.id,
          100
        ),
        tempPassword: result?.tempPassword
          ? sanitizeText(result.tempPassword, 50)
          : "",
        restoredListingsCount: Number(result?.restoredListingsCount) || 0,
        type: type === "providers" ? "provider" : "client",
        restoredLoginMethod: result?.restoredLoginMethod || "",
        pendingGoogleRelink: result?.pendingGoogleRelink === true,
      });

      showSuccessModalFunc("Hesap başarıyla geri yüklendi.");
    } catch (error) {
      if (isDevelopment) {
        console.error("Geri yükleme hatası:", error.message);
      }

      showErrorModalFunc(
        "Hesap geri yüklenirken hata oluştu: " +
          (error.message || "Bilinmeyen hata")
      );
    } finally {
      setRestoreLoadingId(null);
    }
  };

  const closeRestoreSuccessModal = () => {
    setRestoreSuccessModal({
      open: false,
      accountName: "",
      tempPassword: "",
      restoredListingsCount: 0,
      type: "",
      restoredLoginMethod: "",
      pendingGoogleRelink: false,
    });
  };

  const toggleExpand = (id) => {
    setExpandedCard(expandedCard === id ? null : id);
  };

  if (authLoading) {
    return <LoadingSpinner text="Yetki kontrol ediliyor..." />;
  }

  if (!authorized) {
    return (
      <div className="no-data">
        <i className="fas fa-shield-alt fa-3x"></i>
        <p>{authError || "Bu sayfaya erişim yetkiniz yok."}</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner text="Yükleniyor..." />;
  }

  const isProvider = type === "providers";

  return (
    <div>
      {items.length === 0 ? (
        <div className="no-data">
          <i className="fas fa-trash-restore fa-3x"></i>
          <p>Geri yüklenebilir silinmiş hesap bulunmuyor.</p>
        </div>
      ) : (
        <div className="cards-list">
          {items.map((item) =>
            isProvider ? (
              <DeletedProviderCard
                key={item.id}
                provider={item}
                isExpanded={expandedCard === item.id}
                onToggle={() => toggleExpand(item.id)}
                onRestore={() => openRestoreConfirmModal(item)}
                restoring={restoreLoadingId === item.id}
              />
            ) : (
              <DeletedClientCard
                key={item.id}
                client={item}
                isExpanded={expandedCard === item.id}
                onToggle={() => toggleExpand(item.id)}
                onRestore={() => openRestoreConfirmModal(item)}
                restoring={restoreLoadingId === item.id}
              />
            )
          )}
        </div>
      )}

      {restoreConfirmModal.open && (
        <div className="modal-overlay" onClick={closeRestoreConfirmModal}>
          <div
            className="modal-content restore-confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                <i className="fas fa-trash-restore"></i> Hesabı Geri Yükle
              </h2>

              <button
                type="button"
                className="modal-close"
                onClick={closeRestoreConfirmModal}
                disabled={!!restoreLoadingId}
                aria-label="Kapat"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="modal-body">
              <div className="restore-confirm-icon">
                <i className="fas fa-user-check"></i>
              </div>

              <p className="restore-confirm-text">
                <strong>
                  {sanitizeText(restoreConfirmModal.accountName, 100)}
                </strong>{" "}
                hesabını geri yüklemek istediğinize emin misiniz?
              </p>

              <div className="restore-confirm-warning">
                <i className="fas fa-info-circle"></i>
                <span>
                  Bu işlem hesabı tekrar aktif hale getirir. Kullanıcı
                  bilgileri geri yüklenir. Uzman hesabı ise varsa arşivlenen
                  ilanlarıyla birlikte geri getirilir.
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeRestoreConfirmModal}
                disabled={!!restoreLoadingId}
              >
                Vazgeç
              </button>

              <button
                type="button"
                className="btn-approve restore-confirm-submit"
                onClick={confirmRestoreDeletedAccount}
                disabled={!!restoreLoadingId}
              >
                {restoreLoadingId ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> Geri
                    yükleniyor...
                  </>
                ) : (
                  <>
                    <i className="fas fa-check"></i> Evet, Geri Yükle
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreSuccessModal.open && (
        <div className="modal-overlay" onClick={closeRestoreSuccessModal}>
          <div
            className="modal-content restore-success-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                <i className="fas fa-check-circle"></i> Hesap Geri Yüklendi
              </h2>

              <button
                type="button"
                className="modal-close"
                onClick={closeRestoreSuccessModal}
                aria-label="Kapat"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="modal-body">
              <div className="restore-success-box">
                <p className="restore-confirm-text">
                  <strong>
                    {sanitizeText(restoreSuccessModal.accountName, 100)}
                  </strong>{" "}
                  hesabı başarıyla geri yüklendi.
                </p>

                <div className="restore-confirm-details">
                  {restoreSuccessModal.type === "provider" && (
                    <div className="restore-confirm-row">
                      <span className="restore-confirm-label">
                        Geri Yüklenen İlan Sayısı
                      </span>
                      <span className="restore-confirm-value">
                        {restoreSuccessModal.restoredListingsCount}
                      </span>
                    </div>
                  )}

                  {restoreSuccessModal.restoredLoginMethod && (
                    <div className="restore-confirm-row">
                      <span className="restore-confirm-label">
                        Giriş Yöntemi
                      </span>
                      <span className="restore-confirm-value">
                        {getRestoredLoginMethodText(
                          restoreSuccessModal.restoredLoginMethod
                        )}
                      </span>
                    </div>
                  )}

                  {restoreSuccessModal.tempPassword && (
                    <div className="restore-confirm-row">
                      <span className="restore-confirm-label">
                        Geçici Şifre
                      </span>
                      <span
                        className="restore-confirm-value"
                        style={{
                          fontFamily: "monospace",
                          fontSize: "14px",
                        }}
                      >
                        {restoreSuccessModal.tempPassword}
                      </span>
                    </div>
                  )}
                </div>

                {restoreSuccessModal.tempPassword &&
                  !restoreSuccessModal.pendingGoogleRelink && (
                    <p className="restore-confirm-help">
                      Lütfen kullanıcıya bu geçici şifreyi iletin ve ilk
                      girişten sonra şifresini değiştirmesini isteyin.
                    </p>
                  )}

                {restoreSuccessModal.pendingGoogleRelink &&
                  restoreSuccessModal.tempPassword && (
                    <p className="restore-confirm-help">
                      Bu hesap daha önce Google ile kullanılıyordu. Eski auth
                      kaydı bulunamadığı için geçici şifre oluşturuldu.
                      Kullanıcı bu şifre ile giriş yaptıktan sonra profil &gt;
                      güvenlik bölümünden Google hesabını tekrar bağlamalıdır.
                    </p>
                  )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-approve"
                onClick={closeRestoreSuccessModal}
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div
          className="toast-modal success"
          onClick={() => setShowSuccessModal(false)}
        >
          <div className="toast-content">
            <div className="toast-icon">
              <i className="fas fa-check-circle"></i>
            </div>

            <div className="toast-message">
              {sanitizeText(successMessage, 100)}
            </div>

            <button
              type="button"
              className="toast-close"
              onClick={() => setShowSuccessModal(false)}
              aria-label="Kapat"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}

      {showErrorModal && (
        <div
          className="toast-modal error"
          onClick={() => setShowErrorModal(false)}
        >
          <div className="toast-content">
            <div className="toast-icon">
              <i className="fas fa-times-circle"></i>
            </div>

            <div className="toast-message">
              {sanitizeText(errorMessage, 100)}
            </div>

            <button
              type="button"
              className="toast-close"
              onClick={() => setShowErrorModal(false)}
              aria-label="Kapat"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}