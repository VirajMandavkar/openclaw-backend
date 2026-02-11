/**
 * Authentication Routes
 * Handles user registration, login, and authentication
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const userModel = require('../models/user');
const authService = require('../services/authService');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { authRateLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// Apply strict rate limiting to login and register
router.use('/login', authRateLimiter);
router.use('/register', authRateLimiter);

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post(
  '/register',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required')
      .isLength({ max: 255 })
      .withMessage('Email must be 255 characters or less'),
    body('password')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters')
      .matches(/[a-z]/)
      .withMessage('Password must contain a lowercase letter')
      .matches(/[A-Z]/)
      .withMessage('Password must contain an uppercase letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain a number')
      .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
      .withMessage('Password must contain a special character'),
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;

    try {
      // Create user
      const user = await userModel.create(email, password);

      logger.info('User registered successfully', { userId: user.id, email });

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.created_at,
        },
      });
    } catch (error) {
      if (error.message === 'Email already registered') {
        return res.status(409).json({
          error: 'Registration failed',
          message: 'Email already registered',
        });
      }
      throw error;
    }
  })
);

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;

    // Verify credentials
    const user = await userModel.verifyPassword(email, password);

    if (!user) {
      logger.warn('Failed login attempt', { email });
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password',
      });
    }

    // Generate JWT token
    const token = authService.generateToken(user);

    logger.info('User logged in successfully', { userId: user.id, email });

    res.json({
      message: 'Login successful',
      token,
      expiresIn: authService.JWT_EXPIRY,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  })
);

/**
 * GET /api/auth/me
 * Get current authenticated user info
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    // User is already attached by requireAuth middleware
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        createdAt: req.user.created_at,
        updatedAt: req.user.updated_at,
      },
    });
  })
);

/**
 * POST /api/auth/logout
 * Logout endpoint (client-side token deletion)
 * Note: JWT is stateless, so logout is handled by client discarding token
 */
router.post('/logout', requireAuth, (req, res) => {
  logger.info('User logged out', { userId: req.userId });
  res.json({
    message: 'Logout successful',
  });
});

module.exports = router;
