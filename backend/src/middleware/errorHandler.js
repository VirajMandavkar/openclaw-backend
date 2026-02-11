/**
 * Global Error Handler Middleware
 * Catches and formats errors across the application
 */

const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * Must be defined AFTER all routes
 */
function errorHandler(err, req, res, next) {
  // Log the error (secrets will be redacted by logger)
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.userId,
  });

  // Default to 500 internal server error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // Ensure we don't leak sensitive information in production
  const response = {
    error: message,
  };

  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

/**
 * Handle 404 Not Found errors
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
  });
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors automatically
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
