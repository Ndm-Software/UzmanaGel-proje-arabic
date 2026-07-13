// AdminUsers.jsx file code

import React, { useState, useEffect } from "react";
import { getAllClients } from "../../firebase/adminService";
import { deleteClientByAdmin } from "../../services/adminClientService";
import LoadingSpinner from "../../components/LoadingSpinner";
import UserCard from "../../components/admin/UserCard";
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

export default function AdminUsers() {
  const { authorized, loading: authLoading } = useAdminOnly();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);
  const [isDeleting, setIsDeleting] = useState(false);

  const [clientToDelete, setClientToDelete] = useState(null);
  const [showClientDeleteModal, setShowClientDeleteModal] = useState(false);
  const [clientDeleteError, setClientDeleteError] = useState("");

  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (authorized) {
      loadUsers();
    }
  }, [authorized]);

  const showSuccessToastFunc = (message) => {
    setSuccessMessage(sanitizeText(message, 200));
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  const showErrorToastFunc = (message) => {
    setErrorMessage(sanitizeText(message, 200));
    setShowErrorToast(true);
    setTimeout(() => setShowErrorToast(false), 4000);
  };

  const loadUsers = async () => {
    setLoading(true);

    try {
      const data = await getAllClients();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      if (isDevelopment) {
        console.error("Kullanıcılar yüklenirken hata:", error.message);
      }

      showErrorToastFunc("حدث خطأ أثناء تحميل المستخدمين.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = (user) => {
    if (!user?.id) {
      showErrorToastFunc("معلومات مستخدم غير صالحة");
      return;
    }

    setClientToDelete(user);
    setClientDeleteError("");
    setShowClientDeleteModal(true);
  };

  const handleConfirmDeleteClient = async () => {
    if (!clientToDelete?.id) {
      setClientDeleteError("معلومات مستخدم غير صالحة.");
      return;
    }

    const userName = sanitizeText(
      clientToDelete.displayName || clientToDelete.email || "مستخدم",
      50
    );

    setIsDeleting(true);
    setClientDeleteError("");

    try {
      await deleteClientByAdmin(clientToDelete.id);

      setUsers((prev) =>
        prev.filter((user) => user.id !== clientToDelete.id)
      );

      setShowClientDeleteModal(false);
      setClientToDelete(null);

      showSuccessToastFunc(`تم حذف ${userName} بنجاح!`);
    } catch (error) {
      if (isDevelopment) {
        console.error("Kullanıcı silinirken hata:", error.message);
      }

      setClientDeleteError(
        error?.message || "حدث خطأ أثناء حذف المستخدم."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const closeClientDeleteModal = () => {
    if (isDeleting) return;

    setShowClientDeleteModal(false);
    setClientToDelete(null);
    setClientDeleteError("");
  };

  const toggleExpand = (id) => {
    setExpandedCard(expandedCard === id ? null : id);
  };

  const getFilteredAndSortedData = () => {
    let data = [...users];

    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();

      data = data.filter(
        (item) =>
          (item.displayName &&
            item.displayName.toLowerCase().includes(term)) ||
          (item.email && item.email.toLowerCase().includes(term))
      );
    }

    data.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);

      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return data;
  };

  const handleSortChange = (order) => {
    setSortOrder(order);
    setCurrentPage(1);
  };

  const goToPage = (page) => {
    setCurrentPage(page);
    setExpandedCard(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value.slice(0, 100));
    setCurrentPage(1);
  };

  const clearSearch = () => {
    setSearchTerm("");
    setCurrentPage(1);
  };

  if (authLoading) {
    return <LoadingSpinner text="جاري التحقق من الصلاحيات..." />;
  }

  if (!authorized) {
    return (
      <div className="no-data">
        <i className="fas fa-shield-alt fa-3x"></i>
        <p>ليس لديك صلاحية للوصول إلى هذه الصفحة. يمكن للمسؤولين فقط الوصول.</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner text="جاري التحميل..." />;
  }

  const filteredData = getFilteredAndSortedData();
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  return (
    <div>
      <div className="search-filter-bar">
        <div className="search-wrapper">
          <input
            type="text"
            placeholder="ابحث في المستخدمين (الاسم، البريد الإلكتروني)..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="search-input"
            maxLength={100}
          />

          {searchTerm && (
            <button className="clear-search" onClick={clearSearch}>
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        <div className="filter-group">
          <span className="filter-label">
            <i className="fas fa-sort-amount-down"></i> فرز:
          </span>

          <button
            className={`filter-btn ${sortOrder === "newest" ? "active" : ""}`}
            onClick={() => handleSortChange("newest")}
          >
            🕒 الأحدث
          </button>

          <button
            className={`filter-btn ${sortOrder === "oldest" ? "active" : ""}`}
            onClick={() => handleSortChange("oldest")}
          >
            📅 الأقدم
          </button>
        </div>
      </div>

      {paginatedData.length === 0 ? (
        <div className="no-data">
          <i className="fas fa-user fa-3x"></i>

          <p>
            {searchTerm
              ? "لم يتم العثور على مستخدمين يطابقون بحثك."
              : "لا يوجد مستخدمون مسجلون."}
          </p>

          {searchTerm && (
            <button className="clear-filter-btn" onClick={clearSearch}>
              مسح البحث
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="cards-list">
            {paginatedData.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                isExpanded={expandedCard === user.id}
                onToggle={() => toggleExpand(user.id)}
                onDelete={handleDeleteUser}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1 || isDeleting}
              >
                ← السابق
              </button>

              <span className="page-info">
                {currentPage} / {totalPages}
              </span>

              <button
                className="page-btn"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages || isDeleting}
              >
                التالي →
              </button>
            </div>
          )}
        </>
      )}

      {showClientDeleteModal && clientToDelete && (
        <div className="modal-overlay" onClick={closeClientDeleteModal}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <span className="delete-modal-icon">⚠️</span>
              <h3>حذف المستخدم</h3>
            </div>

            <div className="delete-modal-body">
              <p>
                أنت على وشك حذف المستخدم{" "}
                <strong>
                  {sanitizeText(
                    clientToDelete.displayName ||
                      clientToDelete.email ||
                      "مستخدم",
                    50
                  )}
                </strong>{" "}
                وجميع بياناته <strong style={{ color: "#ef4444" }}>نهائياً</strong>.
              </p>

              <p className="delete-modal-warning">
                هل أنت متأكد من رغبتك في حذف هذا المستخدم؟ سيتم حذف جميع البيانات المرتبطة بهذا الحساب نهائياً.
              </p>

              <p className="delete-modal-warning">هذا الإجراء لا يمكن التراجع عنه!</p>

              {clientDeleteError && (
                <div className="delete-modal-error">
                  ❌ {sanitizeText(clientDeleteError, 200)}
                </div>
              )}
            </div>

            <div className="delete-modal-footer">
              <button
                className="modal-cancel-btn"
                onClick={closeClientDeleteModal}
                disabled={isDeleting}
              >
                إلغاء
              </button>

              <button
                className="modal-delete-btn"
                onClick={handleConfirmDeleteClient}
                disabled={isDeleting}
              >
                {isDeleting ? "جاري الحذف..." : "حذف"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessToast && (
        <div
          className="toast-modal success"
          onClick={() => setShowSuccessToast(false)}
        >
          <div className="toast-content">
            <div className="toast-icon">
              <i className="fas fa-check-circle"></i>
            </div>

            <div className="toast-message">
              {sanitizeText(successMessage, 100)}
            </div>

            <button
              className="toast-close"
              onClick={() => setShowSuccessToast(false)}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}

      {showErrorToast && (
        <div
          className="toast-modal error"
          onClick={() => setShowErrorToast(false)}
        >
          <div className="toast-content">
            <div className="toast-icon">
              <i className="fas fa-times-circle"></i>
            </div>

            <div className="toast-message">
              {sanitizeText(errorMessage, 100)}
            </div>

            <button
              className="toast-close"
              onClick={() => setShowErrorToast(false)}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}