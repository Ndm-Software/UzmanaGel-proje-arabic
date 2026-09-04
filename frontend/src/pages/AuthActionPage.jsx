import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { applyActionCode } from "firebase/auth";

import { auth } from "../firebase/firebaseClient";

import "../styles/LoginPage.css";
import "../styles/AuthActionPage.css";

import PageTransition from "../components/PageTransition";
import MobilePageActions from "../components/MobilePageActions";
import brandImage from "../assets/pictures/logoArabicNoWriting.png";

export default function AuthActionPage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState("checking");
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [errorMessage, setErrorMessage] = useState("");

  // Prevent duplicate execution in React StrictMode during development
  const actionStartedRef = useRef(false);

  /*
   * Keep the same theme behavior used by LoginPage.
   */
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const initial = saved === "light" ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  /*
   * Read Firebase parameters and automatically complete
   * the email verification.
   */
  useEffect(() => {
    if (actionStartedRef.current) return;

    actionStartedRef.current = true;

    const verifyEmail = async () => {
      const params = new URLSearchParams(window.location.search);

      const mode = params.get("mode");
      const oobCode = params.get("oobCode");

      /*
       * This page currently handles email verification.
       */
      if (mode !== "verifyEmail") {
        setStatus("error");
        setErrorMessage("نوع العملية المطلوبة غير مدعوم.");
        return;
      }

      if (!oobCode) {
        setStatus("error");
        setErrorMessage(
          "رابط تأكيد البريد الإلكتروني غير صالح."
        );
        return;
      }

      try {
        /*
         * This consumes the Firebase one-time verification code
         * and marks the email as verified.
         */
        await applyActionCode(auth, oobCode);

        /*
         * If the same Firebase user happens to be logged in,
         * refresh its local state as well.
         */
        if (auth.currentUser) {
          try {
            await auth.currentUser.reload();
          } catch (reloadError) {
            // Verification itself already succeeded,
            // so a reload failure should not change the result.
          }
        }

        setStatus("success");
      } catch (error) {
        console.error(
          "Email verification failed:",
          error?.code,
          error?.message
        );

        setStatus("error");

        switch (error?.code) {
          case "auth/expired-action-code":
            setErrorMessage(
              "انتهت صلاحية رابط تأكيد البريد الإلكتروني. يرجى طلب رابط جديد."
            );
            break;

          case "auth/invalid-action-code":
            setErrorMessage(
              "رابط التأكيد غير صالح، أو تم استخدامه مسبقاً."
            );
            break;

          case "auth/user-disabled":
            setErrorMessage(
              "تم تعطيل هذا الحساب. يرجى التواصل مع الدعم."
            );
            break;

          default:
            setErrorMessage(
              "تعذر تأكيد بريدك الإلكتروني. يرجى المحاولة مرة أخرى."
            );
            break;
        }
      }
    };

    verifyEmail();
  }, []);

  /*
   * After successful verification:
   * 5 → 4 → 3 → 2 → 1 → Login
   */
  useEffect(() => {
    if (status !== "success") return undefined;

    setSecondsLeft(5);

    const countdownInterval = window.setInterval(() => {
      setSecondsLeft((previous) => Math.max(previous - 1, 0));
    }, 1000);

    const redirectTimeout = window.setTimeout(() => {
      navigate("/login", {
        replace: true,
        state: {
          loginNoticeType: "email_verified",
        },
      });
    }, 5000);

    return () => {
      window.clearInterval(countdownInterval);
      window.clearTimeout(redirectTimeout);
    };
  }, [status, navigate]);

  const goToLogin = () => {
    navigate("/login", {
      replace: true,
      state: {
        loginNoticeType:
          status === "success" ? "email_verified" : undefined,
      },
    });
  };

  const renderContent = () => {
    /*
     * Loading
     */
    if (status === "checking") {
      return (
        <>
          <div className="auth-action-status-icon auth-action-status-loading">
            <i className="fas fa-circle-notch fa-spin"></i>
          </div>

          <div className="lp-login-header">
            <h1 className="lp-login-title">
              جارٍ تأكيد بريدك الإلكتروني
            </h1>

            <p className="lp-login-subtitle">
              يرجى الانتظار قليلاً بينما نقوم بالتحقق من الرابط.
            </p>
          </div>

          <div className="auth-action-processing">
            <i className="fas fa-shield-alt"></i>

            <span>
              يتم الآن التحقق من بيانات التأكيد بشكل آمن...
            </span>
          </div>
        </>
      );
    }

    /*
     * Success
     */
    if (status === "success") {
      return (
        <>
          <div className="auth-action-status-icon auth-action-status-success">
            <i className="fas fa-check"></i>
          </div>

          <div className="lp-login-header">
            <h1 className="lp-login-title">
              تم تأكيد بريدك الإلكتروني
            </h1>

            <p className="lp-login-subtitle">
              تم التحقق من عنوان بريدك الإلكتروني بنجاح.
              أصبح بإمكانك الآن تسجيل الدخول إلى حسابك في خبير.
            </p>
          </div>

          <div className="auth-action-success-box">
            <i className="fas fa-check-circle"></i>

            <span>
              تم تفعيل حسابك بنجاح
            </span>
          </div>

          <div className="auth-action-countdown">
            <p>
              سيتم تحويلك تلقائياً إلى صفحة تسجيل الدخول خلال
            </p>

            <div className="auth-action-countdown-number">
              {secondsLeft}
            </div>

            <span>
              {secondsLeft === 1 ? "ثانية" : "ثوانٍ"}
            </span>
          </div>

          <button
            type="button"
            className="lp-login-btn auth-action-login-btn"
            onClick={goToLogin}
          >
            <i className="fas fa-sign-in-alt"></i>
            تسجيل الدخول الآن
          </button>
        </>
      );
    }

    /*
     * Error
     */
    return (
      <>
        <div className="auth-action-status-icon auth-action-status-error">
          <i className="fas fa-times"></i>
        </div>

        <div className="lp-login-header">
          <h1 className="lp-login-title">
            تعذر تأكيد البريد الإلكتروني
          </h1>

          <p className="lp-login-subtitle">
            {errorMessage}
          </p>
        </div>

        <div className="auth-action-error-box">
          <i className="fas fa-exclamation-triangle"></i>

          <span>
            يمكنك العودة إلى تسجيل الدخول وطلب رابط تحقق جديد.
          </span>
        </div>

        <button
          type="button"
          className="lp-login-btn auth-action-login-btn"
          onClick={goToLogin}
        >
          <i className="fas fa-arrow-right"></i>
          العودة إلى تسجيل الدخول
        </button>
      </>
    );
  };

  return (
    <PageTransition>
      <div className="lp-login" dir="rtl">
        <header className="lp-login-topbrand">
          <MobilePageActions className="mobile-page-actions--auth" />

          <Link
            to="/"
            className="lp-login-topbrand-link"
            aria-label="خبير"
          >
            <img
              className="lp-login-topbrand-logo"
              src={brandImage}
              alt="خبير"
            />

            <span className="lp-login-topbrand-text">
              <span>
                {"خ\u0640\u0640ب\u0640\u0640\u0640\u0640\u200D"}
              </span>

              <span>
                {"\u200Dي\u0640\u0640\u0640\u0640\u0640\u200D"}
              </span>

              <span>
                {"\u200D\u0640\u0640ر"}
              </span>
            </span>
          </Link>
        </header>

        <div className="lp-login-card auth-action-card">
          <section className="lp-login-left auth-action-left">
            <div className="auth-action-content">
              {renderContent()}
            </div>
          </section>

          <section className="lp-login-right">
            <div className="lp-login-quote">
              <i className="fas fa-quote-left lp-login-quote-icon"></i>

              <p>
                حسابك أصبح أكثر أماناً، <br />
                وخطوتك الأولى مع خبير <br />
                أصبحت جاهزة.
              </p>

              <span className="lp-login-quote-author">
                - خبير
              </span>
            </div>
          </section>
        </div>
      </div>
    </PageTransition>
  );
}