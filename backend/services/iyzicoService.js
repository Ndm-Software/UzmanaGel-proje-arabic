// backend/services/iyzicoService.js

const Iyzipay = require("iyzipay");
const { admin, db } = require("../firebaseAdmin");

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const DEFAULT_TOKEN_PRICE = 50;
const CURRENCY = "TRY";

const PAYMENT_EXPIRE_SECONDS = 15 * 60; // 15 minutes
const FALLBACK_PAYMENT_EXPIRE_MS = PAYMENT_EXPIRE_SECONDS * 1000;

let iyzipayInstance = null;

function getIyzipayClient() {
  if (iyzipayInstance) return iyzipayInstance;

  const apiKey = String(process.env.IYZICO_API_KEY || "").trim();
  const secretKey = String(process.env.IYZICO_SECRET_KEY || "").trim();
  const uri = String(
    process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com"
  ).trim();

  if (!apiKey || !secretKey) {
    throw new Error("IYZICO_API_KEY and IYZICO_SECRET_KEY are required.");
  }

  iyzipayInstance = new Iyzipay({
    apiKey,
    secretKey,
    uri,
  });

  return iyzipayInstance;
}

function formatPrice(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error("Invalid price value.");
  }

  return numberValue.toFixed(2);
}

function normalizeMoney(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return Math.round(numberValue * 100) / 100;
}

function moneyEquals(a, b) {
  const left = normalizeMoney(a);
  const right = normalizeMoney(b);

  if (left === null || right === null) {
    return false;
  }

  return Math.abs(left - right) < 0.01;
}

function splitFullName(displayName, email) {
  const rawName = String(displayName || "").trim();
  const fallback =
    String(email || "uzman@example.com").split("@")[0] || "Uzman";

  const parts = (rawName || fallback).split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { name: "Uzman", surname: "Kullanici" };
  }

  if (parts.length === 1) {
    return { name: parts[0], surname: "Kullanici" };
  }

  return {
    name: parts[0],
    surname: parts.slice(1).join(" "),
  };
}

function getClientIp(reqIp) {
  const raw = String(reqIp || "").trim();
  if (!raw) return "127.0.0.1";

  return raw.replace("::ffff:", "");
}

function timestampToMillis(value) {
  if (!value) return null;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeInitializeResult(result = {}) {
  return {
    status: result.status || null,
    locale: result.locale || null,
    systemTime: result.systemTime || null,
    conversationId: result.conversationId || null,
    token: result.token || null,
    tokenExpireTime: result.tokenExpireTime || null,
    paymentPageUrl: result.paymentPageUrl || null,
    payWithIyzicoPageUrl: result.payWithIyzicoPageUrl || null,
    errorCode: result.errorCode || null,
    errorMessage: result.errorMessage || null,
  };
}

function sanitizeCallbackResult(result = {}) {
  const itemTransactions = Array.isArray(result.itemTransactions)
    ? result.itemTransactions.map((item) => ({
        itemId: item.itemId || null,
        paymentTransactionId: item.paymentTransactionId || null,
        transactionStatus: item.transactionStatus ?? null,
        price: item.price ?? null,
        paidPrice: item.paidPrice ?? null,
        merchantPayoutAmount: item.merchantPayoutAmount ?? null,
        iyziCommissionFee: item.iyziCommissionFee ?? null,
        iyziCommissionRateAmount: item.iyziCommissionRateAmount ?? null,
        blockageResolvedDate: item.blockageResolvedDate || null,
      }))
    : [];

  return {
    status: result.status || null,
    paymentStatus: result.paymentStatus || null,
    paymentId: result.paymentId || null,
    conversationId: result.conversationId || null,
    basketId: result.basketId || null,
    currency: result.currency || null,
    price: result.price ?? null,
    paidPrice: result.paidPrice ?? null,
    installment: result.installment ?? null,
    fraudStatus: result.fraudStatus ?? null,

    cardType: result.cardType || null,
    cardAssociation: result.cardAssociation || null,
    cardFamily: result.cardFamily || null,
    lastFourDigits: result.lastFourDigits || null,

    errorCode: result.errorCode || null,
    errorMessage: result.errorMessage || null,

    itemTransactions,
  };
}

function mapFailureStatus(result = {}) {
  const paymentStatus = String(result.paymentStatus || "").toUpperCase();

  const text = [
    result.status,
    result.paymentStatus,
    result.errorCode,
    result.errorMessage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    paymentStatus === "CANCELLED" ||
    paymentStatus === "CANCELED" ||
    text.includes("cancel")
  ) {
    return "CANCELLED";
  }

  if (
    paymentStatus === "EXPIRED" ||
    text.includes("expire") ||
    text.includes("expired") ||
    text.includes("süresi") ||
    text.includes("token timeout")
  ) {
    return "EXPIRED";
  }

  return "FAILED";
}

async function getTokenUnitPrice() {
  try {
    const snap = await db.collection("admin_settings").doc("pricing").get();
    const tokenPrice = Number(snap.exists ? snap.data()?.tokenPrice : null);

    if (Number.isFinite(tokenPrice) && tokenPrice > 0 && tokenPrice <= 10000) {
      return tokenPrice;
    }

    return DEFAULT_TOKEN_PRICE;
  } catch {
    return DEFAULT_TOKEN_PRICE;
  }
}

function createCheckoutFormInitialize(request) {
  const iyzipay = getIyzipayClient();

  return new Promise((resolve, reject) => {
    iyzipay.checkoutFormInitialize.create(request, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function retrieveCheckoutForm(request) {
  const iyzipay = getIyzipayClient();

  return new Promise((resolve, reject) => {
    iyzipay.checkoutForm.retrieve(request, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

async function assertProviderCanBuyTokens(uid) {
  const [userSnap, providerSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("service_providers").doc(uid).get(),
  ]);

  if (!userSnap.exists) {
    const error = new Error("User not found.");
    error.statusCode = 403;
    throw error;
  }

  const userData = userSnap.data() || {};
  const providerData = providerSnap.exists ? providerSnap.data() || {} : {};

  if (userData.userType !== "PROVIDER") {
    const error = new Error("Only approved experts can buy tokens.");
    error.statusCode = 403;
    throw error;
  }

  if (!providerSnap.exists || providerData.isActive !== true) {
    const error = new Error("Expert approval is required.");
    error.statusCode = 403;
    throw error;
  }

  return { userData, providerData };
}

function assertRetrievedPaymentMatches({ paymentId, paymentData, retrieveResult }) {
  const expectedConversationId = String(paymentData.conversationId || paymentId);
  const actualConversationId = String(retrieveResult.conversationId || "");
  const actualBasketId = String(retrieveResult.basketId || "");

  if (actualConversationId && actualConversationId !== expectedConversationId) {
    throw new Error("iyzico conversationId does not match payment record.");
  }

  if (actualBasketId && actualBasketId !== expectedConversationId) {
    throw new Error("iyzico basketId does not match payment record.");
  }

  if (
    retrieveResult.currency &&
    String(retrieveResult.currency).toUpperCase() !==
      String(paymentData.currency || CURRENCY).toUpperCase()
  ) {
    throw new Error("iyzico currency does not match payment record.");
  }

  const expectedTotal = Number(paymentData.totalPrice);
  const actualPaidPrice =
    retrieveResult.paidPrice !== undefined
      ? Number(retrieveResult.paidPrice)
      : Number(retrieveResult.price);

  if (!moneyEquals(actualPaidPrice, expectedTotal)) {
    throw new Error("iyzico paid price does not match payment total.");
  }
}

async function markPaymentTerminalIfNotPaid({
  paymentRef,
  status,
  retrieveResult,
  errorCode = null,
  errorMessage = null,
}) {
  let finalStatus = status;

  await db.runTransaction(async (transaction) => {
    const freshSnap = await transaction.get(paymentRef);
    const freshData = freshSnap.data() || {};

    if (freshData.status === "PAID") {
      finalStatus = "PAID";
      return;
    }

    transaction.set(
      paymentRef,
      {
        status,
        iyzicoPaymentStatus: retrieveResult?.paymentStatus || null,
        iyzicoErrorCode: errorCode || retrieveResult?.errorCode || null,
        iyzicoErrorMessage:
          errorMessage || retrieveResult?.errorMessage || "Payment failed.",
        iyzicoCallbackResult: sanitizeCallbackResult(retrieveResult || {}),
        updatedAt: FieldValue.serverTimestamp(),
        ...(status === "FAILED"
          ? { failedAt: FieldValue.serverTimestamp() }
          : null),
        ...(status === "CANCELLED"
          ? { cancelledAt: FieldValue.serverTimestamp() }
          : null),
        ...(status === "EXPIRED"
          ? { expiredAt: FieldValue.serverTimestamp() }
          : null),
      },
      { merge: true }
    );
  });

  return finalStatus;
}

async function maybeExpirePendingPayment(paymentRef, data) {
  const status = String(data.status || "").toUpperCase();

  if (status !== "PENDING") {
    return data;
  }

  const expiresAtMs = timestampToMillis(data.expiresAt);
  const createdAtMs = timestampToMillis(data.createdAt);

  const fallbackExpiresAtMs = createdAtMs
    ? createdAtMs + FALLBACK_PAYMENT_EXPIRE_MS
    : null;

  const effectiveExpiresAtMs = expiresAtMs || fallbackExpiresAtMs;

  if (!effectiveExpiresAtMs || Date.now() <= effectiveExpiresAtMs) {
    return data;
  }

  await paymentRef.set(
    {
      status: "EXPIRED",
      expiredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ...data,
    status: "EXPIRED",
  };
}

async function createTokenCheckout({ uid, email, tokenAmount, ip }) {
  const { userData, providerData } = await assertProviderCanBuyTokens(uid);

  const unitPrice = await getTokenUnitPrice();
  const totalPrice = tokenAmount * unitPrice;
  const priceString = formatPrice(totalPrice);

  const paymentRef = db.collection("payments").doc();
  const paymentId = paymentRef.id;

  const serverUrl = String(
    process.env.SERVER_URL || "http://localhost:5000"
  ).replace(/\/$/, "");

  const callbackUrl = `${serverUrl}/api/payments/iyzico/callback`;

  const buyerEmail = String(
    email || userData.email || "test@uzmangel.com"
  ).trim();

  const displayName =
    String(userData.displayName || "").trim() ||
    String(providerData.businessName || "").trim() ||
    buyerEmail.split("@")[0];

  const { name, surname } = splitFullName(displayName, buyerEmail);

  await paymentRef.set({
    providerUid: uid,
    type: "TOKEN_PURCHASE",
    provider: "IYZICO",
    status: "PENDING",
    tokenAmount,
    unitPrice,
    totalPrice,
    currency: CURRENCY,
    conversationId: paymentId,
    callbackUrl,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId: paymentId,
    price: priceString,
    paidPrice: priceString,
    currency: Iyzipay.CURRENCY.TRY,
    basketId: paymentId,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl,
    enabledInstallments: [1, 2, 3, 6, 9],
    buyer: {
      id: uid,
      name,
      surname,
      gsmNumber: String(userData.phoneNumber || "+905350000000"),
      email: buyerEmail,
      identityNumber: String(userData.identityNumber || "11111111111"),
      registrationAddress: String(
        providerData.address || userData.address || "Test Address"
      ),
      ip: getClientIp(ip),
      city: String(providerData.city || userData.city || "Istanbul"),
      country: "Turkey",
      zipCode: String(providerData.zipCode || userData.zipCode || "34000"),
    },
    shippingAddress: {
      contactName: `${name} ${surname}`,
      city: String(providerData.city || userData.city || "Istanbul"),
      country: "Turkey",
      address: String(providerData.address || userData.address || "Test Address"),
      zipCode: String(providerData.zipCode || userData.zipCode || "34000"),
    },
    billingAddress: {
      contactName: `${name} ${surname}`,
      city: String(providerData.city || userData.city || "Istanbul"),
      country: "Turkey",
      address: String(providerData.address || userData.address || "Test Address"),
      zipCode: String(providerData.zipCode || userData.zipCode || "34000"),
    },
    basketItems: [
      {
        id: `TOKEN-${tokenAmount}`,
        name: `${tokenAmount} Jeton Paketi`,
        category1: "Jeton",
        category2: "UzmanaGel",
        itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
        price: priceString,
      },
    ],
  };

  const result = await createCheckoutFormInitialize(request);

  if (result.status !== "success") {
    await paymentRef.set(
      {
        status: "FAILED",
        iyzicoErrorCode: result.errorCode || null,
        iyzicoErrorMessage:
          result.errorMessage || "iyzico checkout initialization failed.",
        iyzicoInitializeResult: sanitizeInitializeResult(result),
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const error = new Error(
      result.errorMessage || "iyzico checkout initialization failed."
    );
    error.statusCode = 400;
    throw error;
  }

  const tokenExpireSeconds = PAYMENT_EXPIRE_SECONDS;
  const expiresAt = Timestamp.fromMillis(
    Date.now() + tokenExpireSeconds * 1000
  );

  await paymentRef.set(
    {
      iyzicoToken: result.token || null,
      tokenExpireTime: tokenExpireSeconds,
      expiresAt,
      paymentPageUrl: result.paymentPageUrl || null,

      // Intentionally do not store checkoutFormContent.
      // It is too large and not needed because the frontend uses paymentPageUrl.
      iyzicoInitializeResult: sanitizeInitializeResult(result),

      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    paymentId,
    tokenAmount,
    unitPrice,
    totalPrice,
    currency: CURRENCY,
    paymentPageUrl: result.paymentPageUrl,
  };
}

async function findPaymentByIyzicoToken(token) {
  const snap = await db
    .collection("payments")
    .where("iyzicoToken", "==", token)
    .limit(1)
    .get();

  if (snap.empty) return null;

  return snap.docs[0];
}

async function finalizeTokenPayment({ token }) {
  const cleanToken = String(token || "").trim();

  if (!cleanToken) {
    const error = new Error("Missing iyzico token.");
    error.statusCode = 400;
    throw error;
  }

  const paymentSnap = await findPaymentByIyzicoToken(cleanToken);

  if (!paymentSnap) {
    const error = new Error("Payment record not found.");
    error.statusCode = 404;
    throw error;
  }

  const paymentRef = paymentSnap.ref;
  const paymentData = paymentSnap.data() || {};

  if (paymentData.status === "PAID") {
    return {
      success: true,
      paymentId: paymentSnap.id,
      status: "PAID",
      alreadyProcessed: true,
    };
  }

  const retrieveResult = await retrieveCheckoutForm({
    locale: Iyzipay.LOCALE.TR,
    conversationId: paymentData.conversationId || paymentSnap.id,
    token: cleanToken,
  });

  const isSuccessful =
    retrieveResult.status === "success" &&
    String(retrieveResult.paymentStatus || "").toUpperCase() === "SUCCESS";

  if (!isSuccessful) {
    const failedStatus = mapFailureStatus(retrieveResult);

    const finalStatus = await markPaymentTerminalIfNotPaid({
      paymentRef,
      status: failedStatus,
      retrieveResult,
    });

    return {
      success: finalStatus === "PAID",
      paymentId: paymentSnap.id,
      status: finalStatus,
      message: retrieveResult.errorMessage || "Payment failed.",
    };
  }

  try {
    assertRetrievedPaymentMatches({
      paymentId: paymentSnap.id,
      paymentData,
      retrieveResult,
    });
  } catch (error) {
    const finalStatus = await markPaymentTerminalIfNotPaid({
      paymentRef,
      status: "FAILED",
      retrieveResult,
      errorCode: "PAYMENT_DATA_MISMATCH",
      errorMessage: error.message,
    });

    return {
      success: finalStatus === "PAID",
      paymentId: paymentSnap.id,
      status: finalStatus,
      message: error.message,
    };
  }

  let alreadyProcessed = false;

  await db.runTransaction(async (transaction) => {
    const freshPaymentSnap = await transaction.get(paymentRef);

    if (!freshPaymentSnap.exists) {
      throw new Error("Payment record disappeared during transaction.");
    }

    const freshPaymentData = freshPaymentSnap.data() || {};

    if (freshPaymentData.status === "PAID") {
      alreadyProcessed = true;
      return;
    }

    const providerUid = freshPaymentData.providerUid;
    const tokenAmount = Number(freshPaymentData.tokenAmount) || 0;

    if (!providerUid || tokenAmount <= 0) {
      throw new Error("Invalid payment data for token update.");
    }

    const providerRef = db.collection("service_providers").doc(providerUid);

    // Deterministic id prevents duplicate wallet transaction documents.
    const walletTransactionRef = db
      .collection("wallet_transactions")
      .doc(`${paymentSnap.id}_LOAD`);

      // 22 mayis eklendi / Edrees
    const paidAmount = Number(freshPaymentData.totalPrice) || 0;

    transaction.set(
      providerRef,
      {
        currentTokenCount: FieldValue.increment(tokenAmount),
        
        tokenBalance: FieldValue.increment(tokenAmount),

        // 22 mayis eklendi / Edrees
        lifetimeTotalTokens: FieldValue.increment(tokenAmount),
        lifetimeTotalSpend: FieldValue.increment(paidAmount),

        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    

    transaction.set(
      walletTransactionRef,
      {
        providerUid,
        paymentId: paymentSnap.id,
        type: "LOAD",
        source: "IYZICO",
        tokenAmount,
        amount: Number(freshPaymentData.totalPrice) || 0,
        currency: freshPaymentData.currency || CURRENCY,
        description: `${tokenAmount} Jeton Yüklemesi`,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    transaction.set(
      paymentRef,
      {
        status: "PAID",
        paidAt: FieldValue.serverTimestamp(),
        iyzicoPaymentId: retrieveResult.paymentId || null,
        iyzicoPaymentStatus: retrieveResult.paymentStatus || null,
        iyzicoCallbackResult: sanitizeCallbackResult(retrieveResult),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return {
    success: true,
    paymentId: paymentSnap.id,
    status: "PAID",
    alreadyProcessed,
  };
}

async function getPaymentForUser({ paymentId, uid }) {
  const paymentRef = db.collection("payments").doc(paymentId);
  const snap = await paymentRef.get();

  if (!snap.exists) {
    const error = new Error("Payment not found.");
    error.statusCode = 404;
    throw error;
  }

  const originalData = snap.data() || {};

  if (originalData.providerUid !== uid) {
    const error = new Error("You cannot view this payment.");
    error.statusCode = 403;
    throw error;
  }

  const data = await maybeExpirePendingPayment(paymentRef, originalData);

  return {
    id: snap.id,
    type: data.type || null,
    provider: data.provider || null,
    status: data.status || null,
    tokenAmount: data.tokenAmount || 0,
    unitPrice: data.unitPrice || 0,
    totalPrice: data.totalPrice || 0,
    currency: data.currency || CURRENCY,
    createdAt: data.createdAt || null,
    paidAt: data.paidAt || null,
    failedAt: data.failedAt || null,
    cancelledAt: data.cancelledAt || null,
    expiredAt: data.expiredAt || null,
    expiresAt: data.expiresAt || null,
  };
}

module.exports = {
  createTokenCheckout,
  finalizeTokenPayment,
  getPaymentForUser,
};