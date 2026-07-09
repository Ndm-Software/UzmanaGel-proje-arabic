// frontend/src/components/TokenModal.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseClient";
import DOMPurify from "dompurify";
import "../styles/TokenModal.css";

const isDevelopment = import.meta.env.DEV;

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const TERMINAL_PAYMENT_STATUSES = ["PAID", "FAILED", "CANCELLED", "EXPIRED"];

const sanitizeText = (text) => {
  if (!text) return "";
  return DOMPurify.sanitize(String(text));
};

// Simple local rate limiting
let paymentAttempts = 0;
let paymentLastAttemptTime = 0;

const isPaymentRateLimited = () => {
  const now = Date.now();

  if (now - paymentLastAttemptTime > 60000) {
    paymentAttempts = 0;
    paymentLastAttemptTime = now;
    return false;
  }

  return paymentAttempts >= 5;
};

const recordPaymentAttempt = () => {
  const now = Date.now();

  if (now - paymentLastAttemptTime > 60000) {
    paymentAttempts = 1;
  } else {
    paymentAttempts += 1;
  }

  paymentLastAttemptTime = now;
};

const showToast = (message, type = "success") => {
  const toast = document.createElement("div");
  toast.className = `token-toast ${type}`;
  toast.innerHTML = `
    <i class="fas ${
      type === "success" ? "fa-check-circle" : "fa-exclamation-circle"
    }"></i>
    ${sanitizeText(message)}
  `;

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
};

const appendIframeMode = (paymentPageUrl) => {
  try {
    const url = new URL(paymentPageUrl);
    url.searchParams.set("iframe", "true");
    return url.toString();
  } catch {
    const separator = paymentPageUrl.includes("?") ? "&" : "?";
    return `${paymentPageUrl}${separator}iframe=true`;
  }
};

const getPaymentFailureMessage = (status) => {
  if (status === "EXPIRED") {
    return "Ödeme süresi doldu. Lütfen yeni bir ödeme işlemi başlatın.";
  }

  if (status === "CANCELLED" || status === "CANCELED") {
    return "Ödeme işlemi iptal edildi. Dilerseniz tekrar deneyebilirsiniz.";
  }

  return "Ödeme başarısız görünüyor. Lütfen tekrar deneyin.";
};

const TokenModal = ({ isOpen, onClose, tokenBalance, onPaymentSuccess }) => {
  const [tokenAmount, setTokenAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [unitPrice, setUnitPrice] = useState(50);
  const [priceLoading, setPriceLoading] = useState(true);

  const [paymentId, setPaymentId] = useState(null);
  const [paymentPageUrl, setPaymentPageUrl] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");
  const [iframeLoading, setIframeLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState(null);
  const [paymentProcessingOverlay, setPaymentProcessingOverlay] =
    useState(false);

  const closeTimerRef = useRef(null);
  const toastShownRef = useRef(false);

  const maxTokenAmount = 10000;

  const totalPrice = useMemo(() => {
    return (Number(tokenAmount) || 0) * unitPrice;
  }, [tokenAmount, unitPrice]);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const resetPaymentState = () => {
    clearCloseTimer();

    setPaymentId(null);
    setPaymentPageUrl("");
    setIframeUrl("");
    setIframeLoading(false);
    setPaymentStatus(null);
    setCheckingStatus(false);
    setLoading(false);
    setPaymentFeedback(null);
    setPaymentProcessingOverlay(false);
    toastShownRef.current = false;
  };

  const handleClose = () => {
    resetPaymentState();

    if (typeof onClose === "function") {
      onClose();
    }
  };

  const scheduleAutoClose = (currentPaymentId) => {
    clearCloseTimer();

    closeTimerRef.current = setTimeout(() => {
      if (typeof onPaymentSuccess === "function") {
        onPaymentSuccess(currentPaymentId);
      }

      handleClose();
    }, 2200);
  };

  const handleBackToSelection = () => {
    clearCloseTimer();

    setPaymentId(null);
    setPaymentPageUrl("");
    setIframeUrl("");
    setIframeLoading(false);
    setPaymentStatus(null);
    setPaymentFeedback(null);
    setCheckingStatus(false);
    setPaymentProcessingOverlay(false);
    toastShownRef.current = false;
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePaymentMessage = (event) => {
      const data = event.data || {};

      if (data.source !== "UZMANAGEL_IYZICO_PAYMENT") return;

      setPaymentProcessingOverlay(true);

      const nextStatus = String(data.status || "").toUpperCase();
      const normalizedStatus =
        nextStatus === "CANCELED" ? "CANCELLED" : nextStatus;

      const nextPaymentId = data.paymentId || paymentId;

      if (normalizedStatus === "PAID") {
        setPaymentStatus("PAID");
        setIframeUrl("");
        setPaymentPageUrl("");
        setIframeLoading(false);
        setCheckingStatus(false);
        setPaymentProcessingOverlay(false);

        setPaymentFeedback({
          type: "success",
          title: "Ödeme Başarılı",
          message: `${tokenAmount} jeton hesabınıza tanımlandı.`,
        });

        if (!toastShownRef.current) {
          showToast(
            `Başarılı! ${tokenAmount} jeton hesabınıza tanımlandı.`,
            "success"
          );
          toastShownRef.current = true;
        }

        scheduleAutoClose(nextPaymentId);
        return;
      }

      if (["FAILED", "CANCELLED", "EXPIRED"].includes(normalizedStatus)) {
        setPaymentStatus(normalizedStatus);
        setIframeUrl("");
        setPaymentPageUrl("");
        setIframeLoading(false);
        setCheckingStatus(false);
        setPaymentProcessingOverlay(false);

        const message = getPaymentFailureMessage(normalizedStatus);

        setPaymentFeedback({
          type: "error",
          title: "Ödeme Tamamlanamadı",
          message,
        });

        if (!toastShownRef.current) {
          showToast(message, "error");
          toastShownRef.current = true;
        }
      }
    };

    window.addEventListener("message", handlePaymentMessage);

    return () => {
      window.removeEventListener("message", handlePaymentMessage);
    };
  }, [isOpen, paymentId, tokenAmount]);

  useEffect(() => {
    const loadTokenPrice = async () => {
      try {
        setPriceLoading(true);

        const priceRef = doc(db, "admin_settings", "pricing");
        const priceSnap = await getDoc(priceRef);

        if (priceSnap.exists()) {
          const tokenPrice = Number(priceSnap.data()?.tokenPrice);

          if (
            Number.isFinite(tokenPrice) &&
            tokenPrice > 0 &&
            tokenPrice <= 10000
          ) {
            setUnitPrice(tokenPrice);
          }
        }
      } catch (error) {
        if (isDevelopment) {
          console.error("Jeton fiyatı yüklenirken hata:", error);
        }

        showToast(
          "Jeton fiyatı yüklenemedi, varsayılan fiyat kullanılıyor.",
          "error"
        );
      } finally {
        setPriceLoading(false);
      }
    };

    if (isOpen) {
      loadTokenPrice();
      paymentAttempts = 0;
      paymentLastAttemptTime = 0;
    } else {
      resetPaymentState();
    }

    return () => {
      clearCloseTimer();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !paymentId) return;
    if (TERMINAL_PAYMENT_STATUSES.includes(paymentStatus)) return;

    let stopped = false;
    let intervalId = null;

    const checkPaymentStatus = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser || stopped) return;

      try {
        setCheckingStatus(true);

        const idToken = await currentUser.getIdToken();

        const response = await fetch(`${API_BASE_URL}/api/payments/${paymentId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.message || "Ödeme durumu okunamadı.");
        }

        const status = String(data?.payment?.status || "").toUpperCase();

        if (stopped) return;

        setPaymentStatus(status || null);

        if (status === "PAID") {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }

          setIframeUrl("");
          setPaymentPageUrl("");
          setIframeLoading(false);
          setCheckingStatus(false);
          setPaymentProcessingOverlay(false);

          setPaymentFeedback({
            type: "success",
            title: "Ödeme Başarılı",
            message: `${tokenAmount} jeton hesabınıza tanımlandı.`,
          });

          if (!toastShownRef.current) {
            showToast(
              `Başarılı! ${tokenAmount} jeton hesabınıza tanımlandı.`,
              "success"
            );
            toastShownRef.current = true;
          }

          scheduleAutoClose(paymentId);
          return;
        }

        if (["FAILED", "CANCELLED", "EXPIRED"].includes(status)) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }

          setIframeUrl("");
          setPaymentPageUrl("");
          setIframeLoading(false);
          setCheckingStatus(false);
          setPaymentProcessingOverlay(false);

          const message = getPaymentFailureMessage(status);

          setPaymentFeedback({
            type: "error",
            title: "Ödeme Tamamlanamadı",
            message,
          });

          if (!toastShownRef.current) {
            showToast(message, "error");
            toastShownRef.current = true;
          }
        }
      } catch (error) {
        if (isDevelopment) {
          console.error("Ödeme durumu kontrol hatası:", error.message);
        }
      } finally {
        if (!stopped) {
          setCheckingStatus(false);
        }
      }
    };

    checkPaymentStatus();
    intervalId = setInterval(checkPaymentStatus, 3000);

    return () => {
      stopped = true;

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isOpen, paymentId, paymentStatus, tokenAmount]);

  const handleCreateIyzicoIframe = async (e) => {
    e.preventDefault();

    if (isPaymentRateLimited()) {
      showToast("Çok fazla ödeme denemesi. Lütfen 1 dakika bekleyin.", "error");
      return;
    }

    if (!Number.isInteger(Number(tokenAmount))) {
      showToast("Jeton miktarı tam sayı olmalıdır.", "error");
      recordPaymentAttempt();
      return;
    }

    if (tokenAmount < 1 || tokenAmount > maxTokenAmount) {
      showToast(
        `Jeton miktarı 1-${maxTokenAmount.toLocaleString(
          "tr-TR"
        )} arasında olmalıdır.`,
        "error"
      );
      recordPaymentAttempt();
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
      showToast("Oturum bulunamadı. Lütfen tekrar giriş yapın.", "error");
      recordPaymentAttempt();
      return;
    }

    try {
      clearCloseTimer();
      toastShownRef.current = false;

      setLoading(true);
      setIframeLoading(true);
      setPaymentProcessingOverlay(false);
      setPaymentStatus(null);
      setPaymentFeedback(null);

      const idToken = await currentUser.getIdToken(true);

      const response = await fetch(
        `${API_BASE_URL}/api/payments/iyzico/token-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            tokenAmount: Number(tokenAmount),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "iyzico ödeme sayfası oluşturulamadı.");
      }

      if (!data.paymentPageUrl) {
        throw new Error("iyzico paymentPageUrl alınamadı.");
      }

      const nextIframeUrl = appendIframeMode(data.paymentPageUrl);

      setPaymentId(data.paymentId);
      setPaymentPageUrl(data.paymentPageUrl);
      setIframeUrl(nextIframeUrl);
      setPaymentStatus("PENDING");

      paymentAttempts = 0;
    } catch (error) {
      if (isDevelopment) {
        console.error("iyzico iframe başlatma hatası:", error.message);
      }

      showToast(
        error.message || "Ödeme başlatılırken bir hata oluştu.",
        "error"
      );

      recordPaymentAttempt();
      resetPaymentState();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const renderResultCard = () => {
    if (!paymentFeedback) return null;

    const isSuccess = paymentFeedback.type === "success";

    return (
      <div className="payment-result-box">
        <div
          className={`payment-result-icon ${isSuccess ? "success" : "error"}`}
        >
          <i
            className={`fas ${
              isSuccess ? "fa-check-circle" : "fa-exclamation-triangle"
            }`}
          ></i>
        </div>

        <h3>{paymentFeedback.title}</h3>

        <p>{paymentFeedback.message}</p>

        {!isSuccess && (
          <button
            type="button"
            className="pay-btn"
            onClick={handleBackToSelection}
          >
            Tekrar Dene
          </button>
        )}

        {isSuccess && (
          <span className="payment-auto-close-text">
            Pencere birazdan kapanacak...
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="token-modal-overlay" onClick={handleClose}>
      <div className="token-modal" onClick={(e) => e.stopPropagation()}>
        <div className="token-modal-header">
          <h2>
            <i className="fas fa-wallet"></i> Jeton Merkezi
          </h2>

          <button className="close-btn" onClick={handleClose} type="button">
            &times;
          </button>
        </div>

        <div className="token-modal-body">
          {paymentFeedback ? (
            renderResultCard()
          ) : !iframeUrl ? (
            <>
              <div className="info-container">
                <div
                  className="info-trigger"
                  onClick={() => setShowInfo(!showInfo)}
                >
                  <i
                    className={`fas ${
                      showInfo ? "fa-chevron-up" : "fa-info-circle"
                    }`}
                  ></i>
                  {showInfo
                    ? "Bilgiyi Gizle"
                    : "Neden Jeton Almalıyım? Jetonlar Ne İşe Yarar?"}
                </div>

                {showInfo && (
                  <div className="info-content">
                    <div className="info-item">
                      <i className="fas fa-check-circle"></i>
                      <span>
                        Uzmanlar, müşteriler tarafından gönderilen randevu
                        taleplerini kabul etmek için jeton kullanır.
                      </span>
                    </div>

                    <div className="info-item">
                      <i className="fas fa-check-circle"></i>
                      <span>
                        Her randevu onayı için bakiyenizden 1 jeton düşülür.
                      </span>
                    </div>

                    <div className="info-item">
                      <i className="fas fa-undo-alt"></i>
                      <span>
                        Müşteri iptal ederse jetonlar hesabınıza geri iade
                        edilir.
                      </span>
                    </div>

                    <div className="info-item">
                      <i className="fas fa-infinity"></i>
                      <span>Jetonlarınızın kullanım süresi yoktur.</span>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleCreateIyzicoIframe} className="payment-form">
                <div className="token-selection">
                  <label>
                    Yüklenecek Jeton Miktarı Max{" "}
                    {maxTokenAmount.toLocaleString("tr-TR")}
                  </label>

                  <div className="preset-amounts">
                    {[1, 5, 10, 20, 50, 100].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        className={Number(tokenAmount) === amt ? "active" : ""}
                        onClick={() => setTokenAmount(amt)}
                      >
                        {amt}
                      </button>
                    ))}

                    <input
                      type="number"
                      min="1"
                      max={maxTokenAmount}
                      className="custom-amount"
                      value={tokenAmount}
                      onChange={(e) => {
                        let val = parseInt(e.target.value, 10);

                        if (Number.isNaN(val)) val = 1;
                        if (val < 1) val = 1;
                        if (val > maxTokenAmount) val = maxTokenAmount;

                        setTokenAmount(val);
                      }}
                    />
                  </div>
                </div>

                {!priceLoading && (
                  <div className="price-display">
                    <span>1 Jeton = </span>
                    <strong>{unitPrice.toLocaleString("tr-TR")} TL</strong>
                  </div>
                )}

                <div
                  style={{
                    border: "1px solid rgba(214, 178, 94, 0.25)",
                    background: "rgba(15, 23, 42, 0.55)",
                    borderRadius: "14px",
                    padding: "14px",
                    marginTop: "14px",
                    marginBottom: "14px",
                    color: "#d1d5db",
                    fontSize: "13px",
                    lineHeight: 1.6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "8px",
                      color: "#facc15",
                      fontWeight: 700,
                    }}
                  >
                    <i className="fas fa-shield-alt"></i>
                    Güvenli iyzico Ödemesi
                  </div>

                  <div>
                    Kart bilgileriniz UzmanaGel tarafından alınmaz, saklanmaz
                    veya işlenmez. Ödeme işlemi iyzico güvenli ödeme altyapısı
                    üzerinden bu pencere içinde tamamlanır.
                  </div>
                </div>

                <div className="price-display">
                  <span>Mevcut Jeton Bakiyeniz: </span>
                  <strong>
                    {Number(tokenBalance || 0).toLocaleString("tr-TR")}
                  </strong>
                </div>

                <button type="submit" className="pay-btn" disabled={loading}>
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Ödeme Sayfası
                      Hazırlanıyor...
                    </>
                  ) : (
                    <>
                      {totalPrice.toLocaleString("tr-TR")} TL Güvenli Ödemeye
                      Geç
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="payment-form">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <h3 style={{ marginBottom: "4px" }}>
                    <i className="fas fa-lock"></i> iyzico Güvenli Ödeme
                  </h3>

                  <p
                    style={{
                      color: "#9ca3af",
                      fontSize: "12px",
                      margin: 0,
                    }}
                  >
                    {tokenAmount} jeton için{" "}
                    {totalPrice.toLocaleString("tr-TR")} TL ödeme yapıyorsunuz.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleBackToSelection}
                  disabled={loading || checkingStatus}
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    background: "rgba(15, 23, 42, 0.8)",
                    color: "#e5e7eb",
                    borderRadius: "10px",
                    padding: "8px 10px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  <i className="fas fa-arrow-left"></i> Geri
                </button>
              </div>

              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "620px",
                  borderRadius: "16px",
                  overflow: "hidden",
                  border: "1px solid rgba(214, 178, 94, 0.28)",
                  background: "#ffffff",
                }}
              >
                {iframeLoading && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      color: "#111827",
                      background: "#ffffff",
                      zIndex: 2,
                      fontWeight: 700,
                    }}
                  >
                    <i className="fas fa-spinner fa-spin"></i>
                    iyzico ödeme sayfası yükleniyor...
                  </div>
                )}

                {paymentProcessingOverlay && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      zIndex: 5,
                      background: "#111827",
                      color: "#f9fafb",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "12px",
                      textAlign: "center",
                      padding: "24px",
                    }}
                  >
                    <i
                      className="fas fa-spinner fa-spin"
                      style={{ fontSize: "28px" }}
                    ></i>
                    <strong>Ödeme sonucu kontrol ediliyor...</strong>
                    <span style={{ color: "#9ca3af", fontSize: "13px" }}>
                      Lütfen bekleyin, pencere birazdan güncellenecek.
                    </span>
                  </div>
                )}

                <iframe
                  title="iyzico Güvenli Ödeme"
                  src={iframeUrl}
                  onLoad={() => setIframeLoading(false)}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "0",
                    display: "block",
                    background: "#ffffff",
                  }}
                  allow="payment *"
                />
              </div>

              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  color: "#9ca3af",
                  fontSize: "12px",
                  textAlign: "center",
                }}
              >
                {checkingStatus ? (
                  <span>
                    <i className="fas fa-spinner fa-spin"></i> Ödeme durumu
                    kontrol ediliyor...
                  </span>
                ) : (
                  <span>
                    Ödeme tamamlandığında jeton bakiyeniz otomatik olarak
                    güncellenecektir.
                  </span>
                )}

                {paymentPageUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      window.open(paymentPageUrl, "_blank", "noopener,noreferrer")
                    }
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#60a5fa",
                      cursor: "pointer",
                      fontWeight: 700,
                      textDecoration: "underline",
                    }}
                  >
                    Ödeme sayfası açılmadıysa yeni sekmede aç
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenModal;