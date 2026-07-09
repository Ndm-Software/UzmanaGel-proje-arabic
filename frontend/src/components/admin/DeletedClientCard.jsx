// frontend/src/components/admin/DeletedClientCard.jsx

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

  const formatted = date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return formatted === "Invalid Date" ? "-" : formatted;
};

const safeFormatDateTime = (value) => {
  const date = getDate(value);
  if (!date) return "-";

  const formatted = date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return formatted === "Invalid Date" ? "-" : formatted;
};

export default function DeletedClientCard({
  client,
  isExpanded,
  onToggle,
  onRestore,
  restoring,
}) {
  const userData = client?.userData || {};
  const authSnapshot = client?.authSnapshot || {};

  const displayName = sanitizeText(
    getFirstValue(
      userData.displayName,
      authSnapshot.displayName,
      client?.displayName,
      client?.uid,
      client?.id,
      "İsimsiz Kullanıcı"
    ),
    80
  );

  const email = sanitizeText(
    getFirstValue(
      userData.email,
      client?.reservedEmail,
      authSnapshot.email,
      client?.email,
      "-"
    ),
    120
  );

  const phoneNumber = sanitizeText(
    getFirstValue(
      userData.phoneNumber,
      client?.reservedPhoneNumber,
      authSnapshot.phoneNumber,
      client?.phoneNumber,
      "-"
    ),
    40
  );

  const deletedAt = getFirstValue(
    client?.deletedAt,
    client?.deletedDate,
    client?.authDisabledAt,
    client?.createdAt
  );

  const restoreUntil = getFirstValue(
    client?.scheduledPermanentDeletionAt,
    client?.reservedUntil,
    client?.permanentDeleteAt,
    client?.deleteAfter
  );

  const avatarSource = getFirstValue(
    userData.displayName,
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
          <span className="status-badge pending">🗑️ Silinmiş</span>
        </div>

        <div className="card-summary">
          <div className="card-avatar">{avatarLetter}</div>

          <div className="card-basic-info">
            <h3>{displayName}</h3>
            <p className="card-email">{email}</p>
            <p className="card-business">Müşteri Hesabı</p>
          </div>

          <div className="card-quick-stats">
            <span>
              <i className="fas fa-phone"></i> {phoneNumber}
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
              <span className="detail-label">Silinme Tarihi:</span>
              <span className="detail-value">
                {safeFormatDateTime(deletedAt)}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Geri Yükleme Son Tarihi:</span>
              <span className="detail-value">
                {safeFormatDateTime(restoreUntil)}
              </span>
            </div>

            <div className="detail-item detail-item-wide">
              <span className="detail-label">Telefon:</span>
              <span className="detail-value detail-value-phone">{phoneNumber}</span>
            </div>

            <div className="detail-item detail-item-wide">
              <span className="detail-label">E-posta:</span>
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
              {restoring ? " Geri Yükleniyor..." : " Hesabı Geri Yükle"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}