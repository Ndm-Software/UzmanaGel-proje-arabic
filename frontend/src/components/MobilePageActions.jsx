import { Link, useLocation } from "react-router-dom";
import "../styles/MobilePageActions.css";

const MobilePageActions = ({ className = "", showHome = true }) => {
  const location = useLocation();

  if (!showHome && location.pathname === "/") {
    return null;
  }

  return (
    <nav
      className={`mobile-page-actions ${className}`.trim()}
      aria-label="التنقل السريع"
    >
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
