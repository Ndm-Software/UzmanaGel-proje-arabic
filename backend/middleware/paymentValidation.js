// backend/middleware/paymentValidation.js

const MAX_TOKEN_AMOUNT = 10000;

function validateTokenCheckout(req, res, next) {
  const tokenAmount = Number(req.body?.tokenAmount);

  if (!Number.isInteger(tokenAmount)) {
    return res.status(400).json({
      message: "Jeton miktarı tam sayı olmalıdır.",
    });
  }

  if (tokenAmount < 1 || tokenAmount > MAX_TOKEN_AMOUNT) {
    return res.status(400).json({
      message: `Jeton miktarı 1-${MAX_TOKEN_AMOUNT} arasında olmalıdır.`,
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