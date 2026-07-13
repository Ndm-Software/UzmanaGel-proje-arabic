// backend/routes/paymentRoutes.js

const express = require("express");
const router = express.Router();

const authMiddleware = require("../authMiddleware");
const {
  validateTokenCheckout,
} = require("../middleware/paymentValidation");

const {
  createTokenCheckoutController,
  iyzicoCallbackController,
  getPaymentStatusController,
} = require("../controllers/paymentController");

// Expert creates token payment checkout.
router.post(
  "/iyzico/token-checkout",
  authMiddleware,
  validateTokenCheckout,
  createTokenCheckoutController
);

// iyzico callback. No Firebase auth here because iyzico calls this endpoint.
router.post("/iyzico/callback", iyzicoCallbackController);
router.get("/iyzico/callback", iyzicoCallbackController);

// Current user checks payment status.
router.get("/:paymentId", authMiddleware, getPaymentStatusController);

module.exports = router;