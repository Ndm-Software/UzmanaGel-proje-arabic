// UserCard.js file code 

import React from "react";
import DOMPurify from "dompurify";

const sanitizeText = (text, maxLength = 200) => {
  if (!text) return "-";
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + "..." : sanitized;
};

const safeFormatDateTime = (value) => {
  if (!value) return "-";
  try {
    if (typeof value?.toDate === "function") {
      const date = value.toDate();
      if (isNaN(date.getTime())) return "-";
      return date.toLocaleString("tr-TR");
    }
    if (typeof value?.seconds === "number") {
      const date = new Date(value.seconds * 1000);
      if (isNaN(date.getTime())) return "-";
      return date.toLocaleString("tr-TR");
    }
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return String(value).slice(0, 100);
    return parsed.toLocaleString("tr-TR");
  } catch {
    return "-";
  }
};

const safeFormatDate = (value) => {
  if (!value) return "-";
  try {
    if (typeof value?.toDate === "function") {
      const date = value.toDate();
      if (isNaN(date.getTime())) return "-";
      return date.toLocaleDateString("tr-TR");
    }
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("tr-TR");
  } catch {
    return "-";
  }
};

const addressText = (address) => {
  if (!address) return "Adres yok";
  try {
    const parts = [
      address.street ? sanitizeText(address.street, 100) : null,
      address.buildingNo ? `No:${sanitizeText(address.buildingNo, 20)}` : null,
      address.floor ? `Kat:${sanitizeText(address.floor, 10)}` : null,
      address.doorNo ? `Daire:${sanitizeText(address.doorNo, 10)}` : null,
      address.neighborhood ? sanitizeText(address.neighborhood, 100) : null,
      address.district ? sanitizeText(address.district, 100) : null,
      address.city ? sanitizeText(address.city, 100) : null,
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : "Adres detayları yok";
  } catch {
    return "Adres bilgisi okunamadı";
  }
};

const safeStringify = (value, maxLength = 500) => {
  if (value === undefined || value === null) return "-";
  try {
    let str = typeof value === "object" ? JSON.stringify(value) : String(value);
    str = DOMPurify.sanitize(str);
    return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
  } catch {
    return "Veri okunamadı";
  }
};

export default function UserCard({ user, isExpanded, onToggle, onDelete }) {
  const addresses = Array.isArray(user.addresses) ? user.addresses : [];
  const mainAddress =
    user.mainAddress ||
    addresses.find((a) => a.id === user.mainAddressId) ||
    addresses.find((a) => a.isMain === true) ||
    null;

  const hiddenFields = new Set([
    "id",
    "displayName",
    "email",
    "phoneNumber",
    "createdAt",
    "lastLoginAt",
    "isPhoneVerified",
    "addresses",
    "mainAddress",
    "uid",
    "userType",
    "updatedAt",
    "location",
  ]);

  const extraFields = Object.entries(user || {})
    .filter(
      ([key, value]) =>
        !hiddenFields.has(key) &&
        value !== undefined &&
        value !== null &&
        value !== ""
    )
    .sort(([a], [b]) => a.localeCompare(b, "tr"))
    .slice(0, 20);

  const displayName = sanitizeText(user.displayName || "İsim Yok", 100);
  const email = sanitizeText(user.email || "E-posta Yok", 100);
  const phoneNumber = sanitizeText(user.phoneNumber || "Telefon Yok", 20);
  const avatarLetter = sanitizeText((user.displayName || "?").charAt(0).toUpperCase(), 1);
  
  const createdAt = user.createdAt;
  const lastLoginAt = user.lastLoginAt;
  const isPhoneVerified = user.isPhoneVerified === true;
  
  const mainAddressText = mainAddress ? addressText(mainAddress) : "Adres Yok";
  const mainAddressShort = mainAddress
    ? `${mainAddress.district || ""} ${mainAddress.city || ""}`.trim() || "Adres var"
    : "Adres Yok";

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(user);
  };

  return (
    <div className={`data-card ${isExpanded ? "expanded" : ""}`}>
      <div className="card-header" onClick={onToggle}>
        <div className="card-source">
          <span className="role-badge user">👤 Kullanıcı</span>
        </div>
        <div className="card-summary">
          <div className="card-avatar">{avatarLetter}</div>
          <div className="card-basic-info">
            <h3>{displayName}</h3>
            <p className="card-email">{email}</p>
          </div>
          <div className="card-quick-stats">
            {createdAt && (
              <span>
                <i className="fas fa-calendar"></i> {safeFormatDate(createdAt)}
              </span>
            )}
            <span>
              <i className="fas fa-phone"></i> {phoneNumber}
            </span>
            <span>
              <i className="fas fa-map-marker-alt"></i> {mainAddressShort}
            </span>
          </div>
        </div>
        <div className="expand-icon">
          <i className={`fas fa-chevron-${isExpanded ? "up" : "down"}`}></i>
        </div>
      </div>

      {isExpanded && (
        <div className="card-details">
          <div className="details-grid">
            <div className="detail-item">
              <span className="detail-label">Kayıt Tarihi:</span>
              <span className="detail-value">{safeFormatDateTime(createdAt)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Son Giriş:</span>
              <span className="detail-value">{safeFormatDateTime(lastLoginAt)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Telefon:</span>
              <span className="detail-value">{phoneNumber}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Telefon Doğrulama:</span>
              <span className="detail-value">
                {isPhoneVerified ? "✅ Doğrulandı" : "❌ Doğrulanmamış"}
              </span>
            </div>
          </div>

          <div className="detail-section">
            <span className="detail-label">📍 Ana Adres:</span>
            <div className="detail-value" style={{ marginTop: 6 }}>
              {mainAddressText}
            </div>
          </div>

          <div className="detail-section">
            <span className="detail-label">🏠 Tüm Adresler ({addresses.length}):</span>
            {addresses.length === 0 ? (
              <div className="detail-value" style={{ marginTop: 6 }}>
                Kayıtlı adres yok.
              </div>
            ) : (
              <div className="tags" style={{ marginTop: 8 }}>
                {addresses.slice(0, 10).map((address) => (
                  <span 
                    key={address.id} 
                    className="tag" 
                    style={{ whiteSpace: "normal", textAlign: "left" }}
                  >
                    {sanitizeText(address.addressName || "Adres", 50)} - {addressText(address)}
                  </span>
                ))}
                {addresses.length > 10 && (
                  <span className="tag">+{addresses.length - 10} adres daha</span>
                )}
              </div>
            )}
          </div>

          {extraFields.length > 0 && (
            <div className="detail-section">
              <span className="detail-label">📄 Ek Kullanıcı Bilgileri:</span>
              <div className="details-grid" style={{ marginTop: 8 }}>
                {extraFields.map(([key, value]) => (
                  <div key={key} className="detail-item">
                    <span className="detail-label">{sanitizeText(key, 50)}:</span>
                    <span className="detail-value">{safeStringify(value, 200)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="actions">
            <button className="btn-delete" onClick={handleDelete}>
              <i className="fas fa-trash-alt"></i> Kullanıcıyı Sil
            </button>
          </div>
        </div>
      )}
    </div>
  );
}