// frontend/src/components/ExpertProtectedRoute.jsx
// Edrees added this file on Wednesday 29/04/2026

import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../firebase/firebaseClient";
import "../styles/ExpertProtectedRoute.css";

const ExpertProtectedRoute = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [showCheckingLoader, setShowCheckingLoader] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [redirectTo, setRedirectTo] = useState("/login");

  const location = useLocation();

  /*
   * لا نظهر شاشة التحميل مباشرة.
   * إذا انتهى التحقق خلال أقل من 250ms، فلن يظهر وميض التحميل.
   */
  useEffect(() => {
    if (!checking) {
      setShowCheckingLoader(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setShowCheckingLoader(true);
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [checking]);

  useEffect(() => {
    let cancelled = false;

    const finishCheck = ({ isAllowed, nextRedirect }) => {
      if (cancelled) return;

      setAllowed(isAllowed);
      setRedirectTo(nextRedirect || "/login");
      setChecking(false);
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          finishCheck({
            isAllowed: false,
            nextRedirect: "/login",
          });

          return;
        }

        const [userSnap, providerSnap] = await Promise.all([
          getDoc(doc(db, "users", user.uid)),
          getDoc(doc(db, "service_providers", user.uid)),
        ]);

        if (!userSnap.exists()) {
          finishCheck({
            isAllowed: false,
            nextRedirect: "/",
          });

          return;
        }

        const userData = userSnap.data() || {};

        const providerData = providerSnap.exists()
          ? providerSnap.data() || {}
          : {};

        const userType = String(userData.userType || "")
          .trim()
          .toUpperCase();

        if (userType !== "PROVIDER") {
          finishCheck({
            isAllowed: false,
            nextRedirect: "/",
          });

          return;
        }

        if (
          !providerSnap.exists() ||
          providerData.isActive !== true
        ) {
          finishCheck({
            isAllowed: false,
            nextRedirect: "/",
          });

          return;
        }

        finishCheck({
          isAllowed: true,
          nextRedirect: "/login",
        });
      } catch (error) {
        console.error(
          "Expert route protection error:",
          error
        );

        finishCheck({
          isAllowed: false,
          nextRedirect: "/login",
        });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div
        className="expert-protected-route-loading"
        dir="rtl"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        {showCheckingLoader && (
          <div className="expert-protected-route-loading-content">
            <span
              className="expert-protected-route-spinner"
              aria-hidden="true"
            />

            <span>جاري التحقق من صلاحية الحساب...</span>
          </div>
        )}
      </div>
    );
  }

  if (!allowed) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{
          from: location.pathname + location.search,
        }}
      />
    );
  }

  return children;
};

export default ExpertProtectedRoute;