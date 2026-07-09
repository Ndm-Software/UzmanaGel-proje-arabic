// backend/controllers/paymentController.js

const {
  createTokenCheckout,
  finalizeTokenPayment,
  getPaymentForUser,
} = require("../services/iyzicoService");

const isDevelopment = process.env.NODE_ENV === "development";

function getRequestIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();

  return forwardedFor || req.ip || req.socket?.remoteAddress || "127.0.0.1";
}

function getClientUrl() {
  return String(process.env.CLIENT_URL || "http://localhost:5173").replace(
    /\/$/,
    ""
  );
}

async function createTokenCheckoutController(req, res) {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email || null;

    if (!uid) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const result = await createTokenCheckout({
      uid,
      email,
      tokenAmount: req.paymentInput.tokenAmount,
      ip: getRequestIp(req),
    });

    return res.status(201).json({
      success: true,
      paymentId: result.paymentId,
      tokenAmount: result.tokenAmount,
      unitPrice: result.unitPrice,
      totalPrice: result.totalPrice,
      currency: result.currency,
      paymentPageUrl: result.paymentPageUrl,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("createTokenCheckoutController error:", error.message);
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Payment checkout could not be created.",
    });
  }
}

function sendPaymentResultPage(res, payload = {}) {
  const safePayload = {
    payment: String(payload.payment || "error"),
    status: String(payload.status || "FAILED"),
    paymentId: payload.paymentId ? String(payload.paymentId) : "",
    reason: payload.reason ? String(payload.reason) : "",
  };

  const payloadJson = JSON.stringify(safePayload).replace(/</g, "\\u003c");

  return res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .send(`<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ödeme Sonucu</title>
  <style>
    html, body {
      margin: 0;
      min-height: 100vh;
      background: #111827;
      color: #f9fafb;
      font-family: Arial, sans-serif;
    }

    body {
      display: grid;
      place-items: center;
      text-align: center;
      padding: 24px;
      box-sizing: border-box;
    }

    .box {
      max-width: 420px;
    }

    .spinner {
      width: 42px;
      height: 42px;
      border-radius: 999px;
      border: 4px solid rgba(255, 255, 255, 0.18);
      border-top-color: #d4af37;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 18px;
    }

    h1 {
      font-size: 20px;
      margin: 0 0 8px;
    }

    p {
      margin: 0;
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.6;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h1>Ödeme sonucu alındı</h1>
    <p>Lütfen bekleyin, pencere birazdan kapanacak...</p>
  </div>

  <script>
    (function () {
      var payload = ${payloadJson};

      try {
        window.parent.postMessage({
          source: "UZMANAGEL_IYZICO_PAYMENT",
          payment: payload.payment,
          status: payload.status,
          paymentId: payload.paymentId,
          reason: payload.reason
        }, "*");
      } catch (error) {}

      setTimeout(function () {
        try {
          window.parent.postMessage({
            source: "UZMANAGEL_IYZICO_PAYMENT",
            payment: payload.payment,
            status: payload.status,
            paymentId: payload.paymentId,
            reason: payload.reason
          }, "*");
        } catch (error) {}
      }, 400);
    })();
  </script>
</body>
</html>`);
}

async function iyzicoCallbackController(req, res) {
  try {
    const token = req.body?.token || req.query?.token;

    if (isDevelopment) {
      console.log("iyzico callback received:", {
        method: req.method,
        tokenExists: !!token,
      });
    }

    if (!token) {
      return sendPaymentResultPage(res, {
        payment: "error",
        status: "FAILED",
        reason: "missing_token",
      });
    }

    const result = await finalizeTokenPayment({ token });

    if (result.success) {
      return sendPaymentResultPage(res, {
        payment: "success",
        status: "PAID",
        paymentId: result.paymentId,
      });
    }

    const status = String(result.status || "FAILED").toUpperCase();
    const payment = status.toLowerCase();

    return sendPaymentResultPage(res, {
      payment,
      status,
      paymentId: result.paymentId,
      reason: result.message || "",
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("iyzicoCallbackController error:", error.message);
    }

    return sendPaymentResultPage(res, {
      payment: "error",
      status: "FAILED",
      reason: error.message || "callback_error",
    });
  }
}

async function getPaymentStatusController(req, res) {
  try {
    const uid = req.user?.uid;
    const paymentId = String(req.params.paymentId || "").trim();

    if (!uid) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!paymentId) {
      return res.status(400).json({ message: "Payment id is required." });
    }

    const payment = await getPaymentForUser({ paymentId, uid });

    return res.json({
      success: true,
      payment,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("getPaymentStatusController error:", error.message);
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Payment status could not be loaded.",
    });
  }
}

module.exports = {
  createTokenCheckoutController,
  iyzicoCallbackController,
  getPaymentStatusController,
};