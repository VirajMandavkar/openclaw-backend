/**
 * User Model
 * Handles user CRUD operations with parameterized queries
 * SECURITY: All queries use parameterized statements to prevent SQL injection
 */

const db = require('../config/database');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

/**
 * Create a new user
 * @param {string} email - User email
 * @param {string} password - Plain text password (will be hashed)
 * @returns {Promise<Object>} Created user (without password)
 */
async function create(email, password) {
  try {
    // Hash password securely
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await db.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at, updated_at`,
      [email, passwordHash]
    );

    logger.info('User created', { userId: result.rows[0].id, email });
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      // Unique violation
      throw new Error('Email already registered');
    }
    logger.error('Error creating user', { error: error.message });
    throw error;
  }
}

/**
 * Find user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function findByEmail(email) {
  const result = await db.query(
    'SELECT id, email, password_hash, created_at, updated_at FROM users WHERE email = $1',
    [email]
  );

  return result.rows[0] || null;
}

/**
 * Find user by ID
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} User object (without password) or null
 */
async function findById(userId) {
  const result = await db.query(
    'SELECT id, email, created_at, updated_at FROM users WHERE id = $1',
    [userId]
  );

  return result.rows[0] || null;
}

/**
 * Verify user password
 * @param {string} email - User email
 * @param {string} password - Plain text password to verify
 * @returns {Promise<Object|null>} User object (without password) if valid, null otherwise
 */
async function verifyPassword(email, password) {
  const user = await findByEmail(email);

  if (!user) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);

  if (!isValid) {
    return null;
  }

  // Return user without password hash
  const { password_hash, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

/**
 * Update user email
 * @param {string} userId - User UUID
 * @param {string} newEmail - New email address
 * @returns {Promise<Object>} Updated user
 */
async function updateEmail(userId, newEmail) {
  try {
    const result = await db.query(
      `UPDATE users SET email = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, created_at, updated_at`,
      [newEmail, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    logger.info('User email updated', { userId });
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw new Error('Email already in use');
    }
    throw error;
  }
}

/**
 * Update user password
 * @param {string} userId - User UUID
 * @param {string} newPassword - New plain text password (will be hashed)
 * @returns {Promise<boolean>} True if successful
 */
async function updatePassword(userId, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  const result = await db.query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [passwordHash, userId]
  );

  if (result.rowCount === 0) {
    throw new Error('User not found');
  }

  logger.info('User password updated', { userId });
  return true;
}

/**
 * Delete user (cascades to workspaces and subscriptions)
 * @param {string} userId - User UUID
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteUser(userId) {
  const result = await db.query('DELETE FROM users WHERE id = $1', [userId]);

  if (result.rowCount === 0) {
    throw new Error('User not found');
  }

  logger.info('User deleted', { userId });
  return true;
}

module.exports = {
  create,
  findByEmail,
  findById,
  verifyPassword,
  updateEmail,
  updatePassword,
  deleteUser,
};
