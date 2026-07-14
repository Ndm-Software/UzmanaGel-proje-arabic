// frontend/src/components/ExpertProtectedRoute.jsx
// Edrees added this file on Wednesday 29/04/2026

import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseClient";

const ExpertProtectedRoute = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [redirectTo, setRedirectTo] = useState("/login");

  const location = useLocation();

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

        const userType = String(userData.userType || "").trim().toUpperCase();

        if (userType !== "PROVIDER") {
          finishCheck({
            isAllowed: false,
            nextRedirect: "/",
          });
          return;
        }

        if (!providerSnap.exists() || providerData.isActive !== true) {
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
        console.error("Expert route protection error:", error);

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
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#e5e7eb",
          background: "#070b16",
          fontWeight: 700,
        }}
      >
        Kontrol ediliyor...
      </div>
    );
  }

  if (!allowed) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return children;
};

export default ExpertProtectedRoute;