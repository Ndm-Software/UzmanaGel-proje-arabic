// backend/middleware/paymentValidation.js

const MAX_TOKEN_AMOUNT = 10000;

function validateTokenCheckout(req, res, next) {
  const tokenAmount = Number(req.body?.tokenAmount);

  if (!Number.isInteger(tokenAmount)) {
    return res.status(400).json({
      message: "يجب أن تكون كمية الرصيد رقماً صحيحاً.",
    });
  }

  if (tokenAmount < 1 || tokenAmount > MAX_TOKEN_AMOUNT) {
    return res.status(400).json({
      message: `يجب أن تكون كمية الرصيد بين 1 و ${MAX_TOKEN_AMOUNT}.`,
    });
  }

  req.paymentInput = {
    tokenAmount,
  };

  next();
}

module.exports = {
  validateTokenCheckout,
};
