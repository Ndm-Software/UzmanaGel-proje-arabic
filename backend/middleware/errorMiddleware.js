// backend/middleware/errorMiddleware.js
// Global Express error handler — must be the LAST app.use() call.
// Extracted from server.js (lines 1966-1984).

/**
 * errorMiddleware(error, req, res, next)
 * Express recognizes this as an error handler because it has 4 parameters.
 */
function errorMiddleware(error, req, res, _next) {
  console.error("Unhandled error:", {
    path: req.path,
    method: req.method,
    origin: req.headers.origin,
    message: error?.message || String(error),
  });

  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      message: "Request payload too large. Please use a smaller image.",
    });
  }

  return res.status(500).json({
    message: "Unexpected server error.",
    details: error?.message || String(error),
  });
}

module.exports = errorMiddleware;
