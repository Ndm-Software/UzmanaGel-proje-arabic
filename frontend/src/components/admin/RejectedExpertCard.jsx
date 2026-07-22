import React from "react";
import DOMPurify from "dompurify";
import { toArabicServiceLabel } from "../../utils/arabicLabels";

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
    return date.toLocaleDateString("ar-SY");
  } catch {
    return "-";
  }
};

const safeFormatDateTime = (dateString) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString("ar-SY");
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
    console.error("تم حظر رابط غير آمن:", safeUrl);
    return;
  }
  
  try {
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("تعذر فتح المستند:", error);
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
    ? categoryRaw.map((c) => sanitizeText(toArabicServiceLabel(c))).join(", ")
    : sanitizeText(toArabicServiceLabel(categoryRaw));
  
  const city = sanitizeText(expert.city || providerData.city || expert.address?.city || "-");
  const businessName = sanitizeText(expert.businessName || providerData.businessName || "لا يوجد اسم عمل");
  const experienceYears = safeNumber(expert.experienceYears ?? providerData.experienceYears);
  const phoneNumber = sanitizeText(expert.phoneNumber || userData.phoneNumber || "-");
  const email = sanitizeText(expert.email || userData.email || "-");
  const displayNameRaw = expert.displayName || userData.displayName || expert.businessName || "خبير بدون اسم";
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

  const rejectionReason = sanitizeText(expert.rejectionInfo?.reason || "غير محدد");
  const rejectedByName = sanitizeText(expert.rejectionInfo?.rejectedByName || expert.rejectionInfo?.rejectedBy || "غير معروف");
  const rejectedAt = expert.rejectionInfo?.rejectedAt || null;

  const totalDocuments = docsArray.length;

  const avatarLetter = sanitizeText((displayNameRaw || "?").charAt(0).toUpperCase());

  return (
    <div className={`data-card rejected ${isExpanded ? "expanded" : ""}`}>
      <div className="card-header" onClick={onToggle}>
        <div className="card-source">
          <span className="status-badge rejected">❌ مرفوض</span>
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
                <i className="fas fa-briefcase"></i> خبرة {experienceYears} سنوات
              </span>
            )}
            {totalDocuments > 0 && (
              <span>
                <i className="fas fa-file-alt"></i> {totalDocuments} مستند
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
              <span>معلومات الرفض</span>
            </div>
            <div className="rejection-body">
              <div className="rejection-reason">
                <span className="rejection-label">سبب الرفض:</span>
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
              <span className="detail-label">نوع العمل:</span>
              <span className="detail-value">{isCompany ? "شركة" : "فردي"}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">الفئة:</span>
              <span className="detail-value">{category || "-"}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">المدينة:</span>
              <span className="detail-value">{city}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">الخبرة:</span>
              <span className="detail-value">خبرة {experienceYears} سنوات</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">الهاتف:</span>
              <span className="detail-value">{phoneNumber}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">البريد الإلكتروني:</span>
              <span className="detail-value">{email}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">تاريخ التسجيل:</span>
              <span className="detail-value">{safeFormatDate(createdAt)}</span>
            </div>
          </div>

          {specialties.length > 0 && (
            <div className="detail-section">
              <span className="detail-label">⚡ التخصصات:</span>
              <div className="tags" style={{ marginTop: 8 }}>
                {specialties.map((spec, i) => (
                  <span key={i} className="tag">
                    {sanitizeText(toArabicServiceLabel(typeof spec === "string" ? spec : spec?.name || "-"))}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="documents-section">
            <h4>
              <i className="fas fa-folder-open"></i> المستندات المرفوعة {totalDocuments > 0 && `(${totalDocuments})`}
            </h4>
            
            {totalDocuments === 0 ? (
              <div className="no-document" style={{ padding: "20px", textAlign: "center" }}>
                <i className="fas fa-file-alt"></i> لا توجد مستندات مرفوعة لهذا الخبير.
              </div>
            ) : (
              <div className="documents-grid">
                {identityDocs.length > 0 && (
                  <div className="document-group">
                    <div className="document-label">
                      <i className="fas fa-id-card"></i> وثيقة الهوية:
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
                          <i className="fas fa-eye"></i> وثيقة الهوية {identityDocs.length > 1 ? i + 1 : ""}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
 
                {certificateDocs.length > 0 && (
                  <div className="document-group">
                    <div className="document-label">
                      <i className="fas fa-certificate"></i> الشهادات:
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
                          <i className="fas fa-eye"></i> الشهادة {certificateDocs.length > 1 ? i + 1 : ""}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
 
                {taxDocs.length > 0 && (
                  <div className="document-group">
                    <div className="document-label">
                      <i className="fas fa-file-invoice"></i> لوحة الضرائب:
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
                          <i className="fas fa-eye"></i> لوحة الضرائب
                        </a>
                      ))}
                    </div>
                  </div>
                )}
 
                {otherDocs.length > 0 && (
                  <div className="document-group">
                    <div className="document-label">
                      <i className="fas fa-paperclip"></i> المستندات الأخرى:
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
                          <i className="fas fa-eye"></i> مستند {i + 1}
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