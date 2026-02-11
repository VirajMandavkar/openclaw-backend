/**
 * Auth Middleware
 * Validates JWT tokens and attaches user to request
 */

const authService = require('../services/authService');
const userModel = require('../models/user');
const logger = require('../utils/logger');

/**
 * Middleware to require authentication
 * Validates JWT token and attaches user to req.user
 */
async function requireAuth(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authService.extractTokenFromHeader(authHeader);

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided',
      });
    }

    // Verify token
    const decoded = authService.verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid or expired token',
      });
    }

    // Fetch user from database to ensure they still exist
    const user = await userModel.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User not found',
      });
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    logger.error('Auth middleware error', { error: error.message });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication check failed',
    });
  }
}

/**
 * Optional auth middleware
 * Attaches user if token is present, but doesn't require it
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authService.extractTokenFromHeader(authHeader);

    if (!token) {
      return next();
    }

    const decoded = authService.verifyToken(token);

    if (decoded) {
      const user = await userModel.findById(decoded.userId);
      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error', { error: error.message });
    next(); // Continue even if there's an error
  }
}

module.exports = {
  requireAuth,
  optionalAuth,
};
