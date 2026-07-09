import React from "react";
import DOMPurify from "dompurify";

const sanitizeText = (text) => {
  if (!text) return "-";
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > 300 ? sanitized.slice(0, 300) + "..." : sanitized;
};

const safeFormatDate = (dateString) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("tr-TR");
  } catch {
    return "-";
  }
};

const safeFormatDateTime = (dateString) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString("tr-TR");
  } catch {
    return "-";
  }
};

const openDocument = (url) => {
  if (!url) return;
  let fullUrl = url;
  if (url.startsWith("/")) {
    fullUrl = `${window.location.origin}${url}`;
  }
  
  const safeUrl = String(fullUrl || "").trim();
  if (!safeUrl.startsWith("https://") && !safeUrl.startsWith("http://")) {
    console.error("Güvensiz URL engellendi:", safeUrl);
    return;
  }
  
  try {
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("Belge açılamadı:", error);
  }
};

const getDocumentType = (url) => {
  if (!url) return "other";
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes("identity") || lowerUrl.includes("kimlik") || lowerUrl.includes("id")) {
    return "identity";
  }
  if (lowerUrl.includes("certificate") || lowerUrl.includes("sertifika") || lowerUrl.includes("diploma")) {
    return "certificate";
  }
  if (lowerUrl.includes("taxplate") || lowerUrl.includes("vergi") || lowerUrl.includes("tax")) {
    return "tax";
  }
  return "other";
};

const safeNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

export default function RejectedExpertCard({ expert, isExpanded, onToggle }) {
  const providerData = expert.originalData?.providerData || {};
  const userData = expert.userData || {};
  
  const categoryRaw = expert.category || providerData.category || "";
  const category = Array.isArray(categoryRaw)
    ? categoryRaw.map((c) => sanitizeText(c)).join(", ")
    : sanitizeText(categoryRaw);
  
  const city = sanitizeText(expert.city || providerData.city || expert.address?.city || "-");
  const businessName = sanitizeText(expert.businessName || providerData.businessName || "İşletme adı yok");
  const experienceYears = safeNumber(expert.experienceYears ?? providerData.experienceYears);
  const phoneNumber = sanitizeText(expert.phoneNumber || userData.phoneNumber || "-");
  const email = sanitizeText(expert.email || userData.email || "-");
  const displayNameRaw = expert.displayName || userData.displayName || expert.businessName || "İsimsiz Uzman";
  const displayName = sanitizeText(displayNameRaw);
  const createdAt = expert.createdAt || expert.originalData?.createdAt || null;
  
  const specialtiesRaw = (expert.specialties?.length ? expert.specialties : providerData.specialties) || [];
  const specialties = Array.isArray(specialtiesRaw) ? specialtiesRaw : [];
  
  const providerType = expert.providerType || providerData.providerType || "individual";
  const isCompany = providerType === "company";

  const allDocuments = expert.certificates || expert.documents || providerData.certificates || [];
  const docsArray = Array.isArray(allDocuments) ? allDocuments.filter(Boolean) : [];
  
  const identityDocs = docsArray.filter(url => getDocumentType(url) === "identity");
  const certificateDocs = docsArray.filter(url => getDocumentType(url) === "certificate");
  const taxDocs = docsArray.filter(url => getDocumentType(url) === "tax");
  const otherDocs = docsArray.filter(url => getDocumentType(url) === "other");

  const rejectionReason = sanitizeText(expert.rejectionInfo?.reason || "Belirtilmemiş");
  const rejectedByName = sanitizeText(expert.rejectionInfo?.rejectedByName || expert.rejectionInfo?.rejectedBy || "Bilinmeyen");
  const rejectedAt = expert.rejectionInfo?.rejectedAt || null;

  const totalDocuments = docsArray.length;

  const avatarLetter = sanitizeText((displayNameRaw || "?").charAt(0).toUpperCase());

  return (
    <div className={`data-card rejected ${isExpanded ? "expanded" : ""}`}>
      <div className="card-header" onClick={onToggle}>
        <div className="card-source">
          <span className="status-badge rejected">❌ Reddedildi</span>
        </div>

        <div className="card-summary">
          <div className="card-avatar">{avatarLetter}</div>

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
            {totalDocuments > 0 && (
              <span>
                <i className="fas fa-file-alt"></i> {totalDocuments} belge
              </span>
            )}
          </div>
        </div>

        <div className="expand-icon">
          <i className={`fas fa-chevron-${isExpanded ? "up" : "down"}`}></i>
        </div>
      </div>

      {isExpanded && (
        <div className="card-details">
          <div className="rejection-card" style={{ marginTop: "8px" }}>
            <div className="rejection-header">
              <i className="fas fa-times-circle"></i>
              <span>Reddedilme Bilgileri</span>
            </div>
            <div className="rejection-body">
              <div className="rejection-reason">
                <span className="rejection-label">Red Nedeni:</span>
                <span className="rejection-text">{rejectionReason}</span>
              </div>
              <div className="rejection-meta">
                <span>
                  <i className="fas fa-user-shield"></i> {rejectedByName}
                </span>
                <span>
                  <i className="fas fa-calendar-times"></i> {safeFormatDateTime(rejectedAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="details-grid">
            <div className="detail-item">
              <span className="detail-label">İşletme Tipi:</span>
              <span className="detail-value">{isCompany ? "Şirket" : "Bireysel"}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Kategori:</span>
              <span className="detail-value">{category || "-"}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Şehir:</span>
              <span className="detail-value">{city}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Deneyim:</span>
              <span className="detail-value">{experienceYears} yıl</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Telefon:</span>
              <span className="detail-value">{phoneNumber}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">E-posta:</span>
              <span className="detail-value">{email}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Kayıt Tarihi:</span>
              <span className="detail-value">{safeFormatDate(createdAt)}</span>
            </div>
          </div>

          {specialties.length > 0 && (
            <div className="detail-section">
              <span className="detail-label">⚡ Uzmanlıklar:</span>
              <div className="tags" style={{ marginTop: 8 }}>
                {specialties.map((spec, i) => (
                  <span key={i} className="tag">
                    {sanitizeText(typeof spec === "string" ? spec : spec?.name || "-")}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="documents-section">
            <h4>
              <i className="fas fa-folder-open"></i> Yüklenen Belgeler {totalDocuments > 0 && `(${totalDocuments})`}
            </h4>
            
            {totalDocuments === 0 ? (
              <div className="no-document" style={{ padding: "20px", textAlign: "center" }}>
                <i className="fas fa-file-alt"></i> Bu uzmana ait yüklenmiş belge bulunmuyor.
              </div>
            ) : (
              <div className="documents-grid">
                {identityDocs.length > 0 && (
                  <div className="document-group">
                    <div className="document-label">
                      <i className="fas fa-id-card"></i> Kimlik Belgesi:
                    </div>
                    <div className="document-links">
                      {identityDocs.map((url, i) => (
                        <a
                          key={i}
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            openDocument(url);
                          }}
                          className="document-link"
                        >
                          <i className="fas fa-eye"></i> Kimlik Belgesi {identityDocs.length > 1 ? i + 1 : ""}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {certificateDocs.length > 0 && (
                  <div className="document-group">
                    <div className="document-label">
                      <i className="fas fa-certificate"></i> Sertifikalar:
                    </div>
                    <div className="document-links">
                      {certificateDocs.map((url, i) => (
                        <a
                          key={i}
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            openDocument(url);
                          }}
                          className="document-link"
                        >
                          <i className="fas fa-eye"></i> Sertifika {certificateDocs.length > 1 ? i + 1 : ""}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {taxDocs.length > 0 && (
                  <div className="document-group">
                    <div className="document-label">
                      <i className="fas fa-file-invoice"></i> Vergi Levhası:
                    </div>
                    <div className="document-links">
                      {taxDocs.map((url, i) => (
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
                      ))}
                    </div>
                  </div>
                )}

                {otherDocs.length > 0 && (
                  <div className="document-group">
                    <div className="document-label">
                      <i className="fas fa-paperclip"></i> Diğer Belgeler:
                    </div>
                    <div className="document-links">
                      {otherDocs.map((url, i) => (
                        <a
                          key={i}
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            openDocument(url);
                          }}
                          className="document-link"
                        >
                          <i className="fas fa-eye"></i> Belge {i + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}