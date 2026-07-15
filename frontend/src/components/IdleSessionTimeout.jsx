// IdleSessionTimeout.jsx file code

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/firebaseClient";
import { logout } from "../firebase/authService";

const IDLE_TIMEOUT_MS = 40 * 60 * 1000; // 40 min

const REGISTRATION_PATHS = [
  "/register",
];

export default function IdleSessionTimeout() {
  const navigate = useNavigate();
  const location = useLocation();

  const timerRef = useRef(null);
  const currentUserRef = useRef(null);

  const isRegistrationPath = REGISTRATION_PATHS.some((path) =>
    location.pathname.startsWith(path)
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      currentUserRef.current = user;
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const clearIdleTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleSessionExpired = async () => {
      if (!currentUserRef.current) return;

      try {
        await logout();



        navigate("/login", {
          replace: true,
          state: {
            loginNoticeType: "session_expired",
          },
        });
      } catch (error) {
        console.error("Idle session logout error:", error);
      }
    };

    const resetIdleTimer = () => {
      clearIdleTimer();

      if (!currentUserRef.current) return;
      if (isRegistrationPath) return;

      timerRef.current = setTimeout(handleSessionExpired, IDLE_TIMEOUT_MS);
    };

    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetIdleTimer);
    });

    resetIdleTimer();

    return () => {
      clearIdleTimer();

      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer);
      });
    };
  }, [navigate, isRegistrationPath]);

  return null;
}