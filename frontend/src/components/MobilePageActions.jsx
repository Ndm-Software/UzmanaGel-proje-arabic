import { Link, useLocation, useNavigate } from "react-router-dom";
import "../styles/MobilePageActions.css";

const MobilePageActions = ({ className = "", showHome = true }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleBack = () => {
    if (location.key && location.key !== "default") {
      navigate(-1);
      return;
    }

    navigate("/");
  };

  if (!showHome && location.pathname === "/") {
    return null;
  }

  return (
    <nav
      className={`mobile-page-actions ${className}`.trim()}
      aria-label="التنقل السريع"
    >
      {location.pathname !== "/" && (
        <button
          type="button"
          className="mobile-page-action"
          onClick={handleBack}
          aria-label="رجوع"
          title="رجوع"
        >
          <i className="fas fa-arrow-right" aria-hidden="true"></i>
        </button>
      )}

      {showHome && (
        <Link
          to="/"
          className={`mobile-page-action ${
            location.pathname === "/" ? "is-active" : ""
          }`}
          aria-label="الرئيسية"
          title="الرئيسية"
          aria-current={location.pathname === "/" ? "page" : undefined}
        >
          <i className="fas fa-house" aria-hidden="true"></i>
        </Link>
      )}
    </nav>
  );
};

export default MobilePageActions;
