// ExpertCard.jsx file code 
import React from "react";
import DOMPurify from "dompurify";

const sanitizeText = (text) => {
  if (!text) return "-";
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > 200 ? sanitized.slice(0, 200) + "..." : sanitized;
};

const dayNames = {
  monday: "Pazartesi",
  tuesday: "Salı",
  wednesday: "Çarşamba",
  thursday: "Perşembe",
  friday: "Cuma",
  saturday: "Cumartesi",
  sunday: "Pazar",
};

const openDocument = (url) => {
  if (!url) return;
  const safeUrl = String(url || "").trim();
  if (!safeUrl.startsWith("https://") && !safeUrl.startsWith("http://")) {
    console.error("Güvensiz URL engellendi");
    return;
  }
  try {
    if (safeUrl.toLowerCase().includes(".pdf")) {
      window.open(
        `https://docs.google.com/viewer?url=${encodeURIComponent(safeUrl)}`,
        "_blank",
        "noopener,noreferrer"
      );
    } else {
      window.open(safeUrl, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    console.error("Belge açılırken hata:", error);
  }
};

const safeNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

export default function ExpertCard({
  expert,
  onApprove,
  onReject,
  onDelete,
  onViewDetails,
  isExpanded,
  onToggle,
  showActions,
  showDelete,
  isPending,
}) {
  const certificates = Array.isArray(expert.certificates) ? expert.certificates : [];
  
  const identityDocuments = certificates.filter(
    (url) => url && (url.includes("identity") || url.includes("kimlik"))
  );

  const certificateDocuments = certificates.filter(
    (url) => url && (url.includes("certificate") || (!url.includes("identity") && !url.includes("taxplate")))
  );

  const taxDocuments = certificates.filter(
    (url) => url && (url.includes("taxplate") || url.includes("vergi"))
  );

  const displayName = sanitizeText(expert.displayName || "?");
  const email = sanitizeText(expert.email || "-");
  const businessName = sanitizeText(expert.businessName || "-");
  const phoneNumber = sanitizeText(expert.phoneNumber || "-");
  const city = sanitizeText(expert.city || "-");
  const category = Array.isArray(expert.category)
    ? expert.category.map((c) => sanitizeText(c)).join(", ")
    : sanitizeText(expert.category || "-");
  const educationInfo = sanitizeText(expert.educationInfo || "-");
  const pricingType = sanitizeText(expert.pricingType || "Belirtilmemiş");
  const minPrice = safeNumber(expert.minPrice);
  const maxPrice = safeNumber(expert.maxPrice);
  const experienceYears = safeNumber(expert.experienceYears);
  const specialties = Array.isArray(expert.specialties) ? expert.specialties : [];
  const workingHours = expert.workingHours && typeof expert.workingHours === "object" ? expert.workingHours : {};
  const providerType = expert.providerType || "";

  const handleCardClick = () => {
    if (!isPending && typeof onViewDetails === "function") {
      onViewDetails();
      return;
    }
    onToggle();
  };

  return (
    <div className={`data-card ${isExpanded ? "expanded" : ""}`}>
      <div className="card-header" onClick={handleCardClick}>
        <div className="card-source">
          {isPending ? (
            <span className="status-badge pending">⏳ Bekliyor</span>
          ) : (
            <span className="status-badge approved">✅ Onaylı</span>
          )}
        </div>
        <div className="card-summary">
          <div className="card-avatar">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="card-basic-info">
            <h3>{displayName}</h3>
            <p className="card-email">{email}</p>
            <p className="card-business">{businessName}</p>
          </div>
          <div className="card-quick-stats">
            <span>
              <i className="fas fa-phone"></i> {phoneNumber}
            </span>
            <span>
              <i className="fas fa-map-marker-alt"></i> {city}
            </span>
            {experienceYears > 0 && (
              <span>
                <i className="fas fa-briefcase"></i> {experienceYears} yıl
              </span>
            )}
          </div>
        </div>
        <div className="expand-icon">
          <i className={`fas fa-chevron-${
            !isPending && typeof onViewDetails === "function"
              ? "right"
              : isExpanded
              ? "up"
              : "down"
          }`}></i>
        </div>
      </div>

      {isExpanded && (
        <div className="card-details">
          <div className="details-grid">
            <div className="detail-item">
              <span className="detail-label">Kategori:</span>
              <span className="detail-value">{category}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Şehir:</span>
              <span className="detail-value">{city}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Eğitim:</span>
              <span className="detail-value">{educationInfo}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Fiyat:</span>
              <span className="detail-value">{minPrice}₺ - {maxPrice}₺</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Fiyat Tipi:</span>
              <span className="detail-value">{pricingType}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Deneyim:</span>
              <span className="detail-value">{experienceYears} yıl</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Sertifikalı:</span>
              <span className="detail-value">
                {expert.isCertified ? "✅ Evet" : "❌ Hayır"}
              </span>
            </div>
            {isPending && (
              <div className="detail-item">
                <span className="detail-label">Telefon Doğrulama:</span>
                <span className="detail-value">
                  {expert.isPhoneVerified ? "✅ Doğrulandı" : "❌ Doğrulanmamış"}
                </span>
              </div>
            )}
          </div>

          {specialties.length > 0 && (
            <div className="detail-section">
              <span className="detail-label">⚡ Uzmanlıklar:</span>
              <div className="tags">
                {specialties.map((spec, i) => (
                  <span key={i} className="tag">
                    {sanitizeText(typeof spec === "string" ? spec : spec?.name || "-")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {Object.keys(workingHours).length > 0 && (
            <div className="detail-section">
              <span className="detail-label">🕒 Çalışma Saatleri:</span>
              <div className="working-hours-detail">
                {Object.entries(workingHours).map(([day, hours]) =>
                  hours?.enabled ? (
                    <div key={day} className="working-hour-item-detail">
                      <span className="working-hour-day">{dayNames[day]}:</span>
                      <span className="working-hour-time">
                        {hours.start || "?"} - {hours.end || "?"}
                      </span>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          <div className="documents-section">
            <h4>
              <i className="fas fa-folder-open"></i> Yüklenen Belgeler
            </h4>
            <div className="documents-grid">
              <div className="document-group">
                <div className="document-label">
                  <i className="fas fa-id-card"></i> Kimlik Belgesi:
                </div>
                <div className="document-links">
                  {identityDocuments.length > 0 ? (
                    identityDocuments.map((url, i) => (
                      <a
                        key={i}
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          openDocument(url);
                        }}
                        className="document-link"
                      >
                        <i className="fas fa-eye"></i> Kimlik {i + 1}
                      </a>
                    ))
                  ) : (
                    <span className="no-document">Belge yüklenmemiş</span>
                  )}
                </div>
              </div>

              <div className="document-group">
                <div className="document-label">
                  <i className="fas fa-certificate"></i> Sertifikalar:
                </div>
                <div className="document-links">
                  {certificateDocuments.length > 0 ? (
                    certificateDocuments.map((url, i) => (
                      <a
                        key={i}
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          openDocument(url);
                        }}
                        className="document-link"
                      >
                        <i className="fas fa-eye"></i> Sertifika {i + 1}
                      </a>
                    ))
                  ) : (
                    <span className="no-document">Belge yüklenmemiş</span>
                  )}
                </div>
              </div>

              <div className="document-group">
                <div className="document-label">
                  <i className="fas fa-file-invoice"></i> Vergi Levhası:
                </div>
                <div className="document-links">
                  {taxDocuments.length > 0 ? (
                    taxDocuments.map((url, i) => (
                      <a
                        key={i}
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          openDocument(url);
                        }}
                        className="document-link"
                      >
                        <i className="fas fa-eye"></i> Vergi Levhası
                      </a>
                    ))
                  ) : (
                    <span className="no-document">
                      {providerType === "Şirket"
                        ? "Vergi levhası bekleniyor"
                        : "Şahıs işletmesi"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="actions">
            {showActions && (
              <>
                <button 
                  className="btn-approve" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove(expert);
                  }}
                >
                  ✅ Onayla
                </button>
                <button 
                  className="btn-reject" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject(expert);
                  }}
                >
                  ❌ Reddet
                </button>
              </>
            )}
            {showDelete && (
              <button 
                className="btn-delete" 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(expert);
                }}
              >
                <i className="fas fa-trash-alt"></i> Uzmanı Sil
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}