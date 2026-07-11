// frontend/src/components/admin/DeletedProviderCard.jsx

import React from "react";
import DOMPurify from "dompurify";

const sanitizeText = (text, maxLength = 200) => {
  if (text === null || text === undefined || text === "") return "-";

  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength
    ? `${sanitized.slice(0, maxLength)}...`
    : sanitized;
};

const getFirstValue = (...values) => {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
};

const isValidDate = (date) => {
  return date instanceof Date && !Number.isNaN(date.getTime());
};

const getDate = (value) => {
  if (!value) return null;

  try {
    if (value instanceof Date) {
      return isValidDate(value) ? value : null;
    }

    // Firestore Timestamp from client SDK
    if (typeof value?.toDate === "function") {
      const date = value.toDate();
      return isValidDate(date) ? date : null;
    }

    // Firestore Timestamp-like object
    if (typeof value?.toMillis === "function") {
      const date = new Date(value.toMillis());
      return isValidDate(date) ? date : null;
    }

    // Timestamp object from backend/admin SDK serialization
    if (typeof value === "object") {
      const seconds = value.seconds ?? value._seconds;
      const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;

      if (seconds !== undefined && seconds !== null) {
        const millis =
          Number(seconds) * 1000 + Math.floor(Number(nanoseconds) / 1000000);

        const date = new Date(millis);
        return isValidDate(date) ? date : null;
      }

      if (value.timestampValue) {
        const date = new Date(value.timestampValue);
        return isValidDate(date) ? date : null;
      }

      if (value.iso) {
        const date = new Date(value.iso);
        return isValidDate(date) ? date : null;
      }
    }

    // Number timestamp: seconds or milliseconds
    if (typeof value === "number") {
      const millis = value < 10000000000 ? value * 1000 : value;
      const date = new Date(millis);
      return isValidDate(date) ? date : null;
    }

    // ISO string or date string
    if (typeof value === "string") {
      const date = new Date(value);
      return isValidDate(date) ? date : null;
    }

    return null;
  } catch {
    return null;
  }
};

const safeFormatDate = (value) => {
  const date = getDate(value);
  if (!date) return "-";

  const formatted = date.toLocaleDateString("ar-SY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return formatted === "Invalid Date" ? "-" : formatted;
};

const safeFormatDateTime = (value) => {
  const date = getDate(value);
  if (!date) return "-";

  const formatted = date.toLocaleString("ar-SY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return formatted === "Invalid Date" ? "-" : formatted;
};

export default function DeletedProviderCard({
  provider,
  isExpanded,
  onToggle,
  onRestore,
  restoring,
}) {
  const userData = provider?.userData || {};
  const providerData = provider?.providerData || {};
  const authSnapshot = provider?.authSnapshot || {};

  const displayName = sanitizeText(
    getFirstValue(
      userData.displayName,
      providerData.businessName,
      authSnapshot.displayName,
      provider?.displayName,
      provider?.uid,
      provider?.id,
      "خبير بدون اسم"
    ),
    80
  );

  const email = sanitizeText(
    getFirstValue(
      userData.email,
      provider?.reservedEmail,
      authSnapshot.email,
      provider?.email,
      "-"
    ),
    120
  );

  const businessName = sanitizeText(
    getFirstValue(
      providerData.businessName,
      userData.displayName,
      authSnapshot.displayName,
      "لا يوجد اسم عمل"
    ),
    100
  );

  const phoneNumber = sanitizeText(
    getFirstValue(
      userData.phoneNumber,
      provider?.reservedPhoneNumber,
      authSnapshot.phoneNumber,
      provider?.phoneNumber,
      "-"
    ),
    40
  );

  const city = sanitizeText(
    getFirstValue(
      providerData.city,
      userData.city,
      provider?.city,
      "-"
    ),
    80
  );

  const category = sanitizeText(
    getFirstValue(
      providerData.category,
      provider?.category,
      "-"
    ),
    100
  );

  const listingsCount =
    typeof provider?.listingsCount === "number"
      ? provider.listingsCount
      : Array.isArray(provider?.deletedListings)
      ? provider.deletedListings.length
      : 0;

  const deletedAt = getFirstValue(
    provider?.deletedAt,
    provider?.deletedDate,
    provider?.authDisabledAt,
    provider?.createdAt
  );

  const restoreUntil = getFirstValue(
    provider?.scheduledPermanentDeletionAt,
    provider?.reservedUntil,
    provider?.permanentDeleteAt,
    provider?.deleteAfter
  );

  const avatarSource = getFirstValue(
    userData.displayName,
    providerData.businessName,
    authSnapshot.displayName,
    userData.email,
    authSnapshot.email,
    "?"
  );

  const avatarLetter = sanitizeText(
    String(avatarSource).charAt(0).toUpperCase(),
    1
  );

  return (
    <div className={`data-card ${isExpanded ? "expanded" : ""}`}>
      <div className="card-header" onClick={onToggle}>
        <div className="card-source">
          <span className="status-badge pending">🗑️ محذوف</span>
        </div>

        <div className="card-summary">
          <div className="card-avatar">{avatarLetter}</div>

          <div className="card-basic-info">
            <h3>{displayName}</h3>
            <p className="card-email">{email}</p>
            <p className="card-business">{businessName}</p>
          </div>

          <div className="card-quick-stats">
            <span className="card-stat-phone">
              <i className="fas fa-phone"></i> {phoneNumber}
            </span>

            <span>
              <i className="fas fa-bullhorn"></i> {listingsCount} إعلان
            </span>

            <span>
              <i className="fas fa-calendar-times"></i>{" "}
              {safeFormatDate(deletedAt)}
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
              <span className="detail-label">تاريخ الحذف:</span>
              <span className="detail-value">
                {safeFormatDateTime(deletedAt)}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">الموعد النهائي للاستعادة:</span>
              <span className="detail-value">
                {safeFormatDateTime(restoreUntil)}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">عدد الإعلانات:</span>
              <span className="detail-value">{listingsCount}</span>
            </div>

            <div className="detail-item">
              <span className="detail-label">المدينة:</span>
              <span className="detail-value">{city}</span>
            </div>

            <div className="detail-item">
              <span className="detail-label">الفئة:</span>
              <span className="detail-value">{category}</span>
            </div>

            <div className="detail-item detail-item-wide">
              <span className="detail-label">الهاتف:</span>
              <span className="detail-value detail-value-phone">{phoneNumber}</span>
            </div>

            <div className="detail-item detail-item-wide">
              <span className="detail-label">البريد الإلكتروني:</span>
              <span className="detail-value detail-value-email">{email}</span>
            </div>
          </div>

          <div className="actions">
            <button
              className="btn-approve"
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
              disabled={restoring}
            >
              <i
                className={`fas ${
                  restoring ? "fa-spinner fa-spin" : "fa-trash-restore"
                }`}
              ></i>
              {restoring ? " جاري الاستعادة..." : " استعادة الحساب"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}