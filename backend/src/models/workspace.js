/**
 * Workspace Model
 * Handles workspace CRUD operations with parameterized queries
 * SECURITY: All queries use parameterized statements to prevent SQL injection
 */

const db = require('../config/database');
const { randomBytes } = require('crypto');
const logger = require('../utils/logger');

/**
 * Generate a secure API key for workspace
 * @returns {string} 64-character hex API key
 */
function generateApiKey() {
  return randomBytes(32).toString('hex');
}

/**
 * Create a new workspace
 * @param {string} userId - User UUID
 * @param {string} name - Workspace name
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object>} Created workspace
 */
async function create(userId, name, options = {}) {
  const apiKey = generateApiKey();
  const cpuLimit = options.cpuLimit || process.env.DEFAULT_CPU_LIMIT || '1.0';
  const memoryLimit = options.memoryLimit || process.env.DEFAULT_MEMORY_LIMIT || '512m';

  try {
    const result = await db.query(
      `INSERT INTO workspaces (user_id, name, api_key, cpu_limit, memory_limit, container_status)
       VALUES ($1, $2, $3, $4, $5, 'stopped')
       RETURNING id, user_id, name, api_key, cpu_limit, memory_limit,
                 container_id, container_status, created_at, updated_at`,
      [userId, name, apiKey, cpuLimit, memoryLimit]
    );

    logger.info('Workspace created', {
      workspaceId: result.rows[0].id,
      userId,
      name,
    });

    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      // Unique violation
      throw new Error('Workspace name already exists');
    }
    logger.error('Error creating workspace', { error: error.message,userId, name });
    throw error;
  }
}

/**
 * Find workspace by ID
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<Object|null>} Workspace object or null
 */
async function findById(workspaceId) {
  const result = await db.query(
    `SELECT id, user_id, name, api_key, cpu_limit, memory_limit,
            container_id, container_status, created_at, updated_at, last_started_at
     FROM workspaces WHERE id = $1`,
    [workspaceId]
  );

  return result.rows[0] || null;
}

/**
 * Find workspace by API key
 * @param {string} apiKey - Workspace API key
 * @returns {Promise<Object|null>} Workspace object or null
 */
async function findByApiKey(apiKey) {
  const result = await db.query(
    `SELECT id, user_id, name, api_key, cpu_limit, memory_limit,
            container_id, container_status, created_at, updated_at, last_started_at
     FROM workspaces WHERE api_key = $1`,
    [apiKey]
  );

  return result.rows[0] || null;
}

/**
 * Find all workspaces for a user
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} Array of workspaces
 */
async function findByUserId(userId) {
  const result = await db.query(
    `SELECT id, user_id, name, api_key, cpu_limit, memory_limit,
            container_id, container_status, created_at, updated_at, last_started_at
     FROM workspaces
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

/**
 * Count workspaces for a user
 * @param {string} userId - User UUID
 * @returns {Promise<number>} Workspace count
 */
async function countByUserId(userId) {
  const result = await db.query('SELECT COUNT(*) FROM workspaces WHERE user_id = $1', [userId]);

  return parseInt(result.rows[0].count, 10);
}

/**
 * Update workspace container information
 * @param {string} workspaceId - Workspace UUID
 * @param {Object} containerInfo - Container info (containerId, status)
 * @returns {Promise<Object>} Updated workspace
 */
async function updateContainer(workspaceId, containerInfo) {
  const { containerId, status } = containerInfo;

  const result = await db.query(
    `UPDATE workspaces
     SET container_id = $1, container_status = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, user_id, name, api_key, cpu_limit, memory_limit,
               container_id, container_status, created_at, updated_at, last_started_at`,
    [containerId, status, workspaceId]
  );

  if (result.rows.length === 0) {
    throw new Error('Workspace not found');
  }

  logger.info('Workspace container updated', {
    workspaceId,
    containerId,
    status,
  });

  return result.rows[0];
}

/**
 * Update workspace status
 * @param {string} workspaceId - Workspace UUID
 * @param {string} status - Container status
 * @returns {Promise<Object>} Updated workspace
 */
async function updateStatus(workspaceId, status) {
  const fields = ['container_status = $1', 'updated_at = NOW()'];
  const params = [status];

  // If status is 'running', update last_started_at
  if (status === 'running') {
    fields.push('last_started_at = NOW()');
  }

  const result = await db.query(
    `UPDATE workspaces
     SET ${fields.join(', ')}
     WHERE id = $${params.length + 1}
     RETURNING id, user_id, name, api_key, cpu_limit, memory_limit,
               container_id, container_status, created_at, updated_at, last_started_at`,
    [...params, workspaceId]
  );

  if (result.rows.length === 0) {
    throw new Error('Workspace not found');
  }

  logger.info('Workspace status updated', { workspaceId, status });

  return result.rows[0];
}

/**
 * Delete workspace
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteWorkspace(workspaceId) {
  const result = await db.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);

  if (result.rowCount === 0) {
    throw new Error('Workspace not found');
  }

  logger.info('Workspace deleted', { workspaceId });

  return true;
}

/**
 * Check if user owns workspace
 * @param {string} workspaceId - Workspace UUID
 * @param {string} userId - User UUID
 * @returns {Promise<boolean>} True if user owns workspace
 */
async function isOwner(workspaceId, userId) {
  const result = await db.query(
    'SELECT 1 FROM workspaces WHERE id = $1 AND user_id = $2',
    [workspaceId, userId]
  );

  return result.rows.length > 0;
}

/**
 * Find all running workspaces (for health monitoring)
 * @returns {Promise<Array>} Array of running workspaces
 */
async function findRunning() {
  const result = await db.query(
    `SELECT id, user_id, name, container_id, container_status, last_started_at
     FROM workspaces
     WHERE container_status = 'running' AND container_id IS NOT NULL`,
    []
  );

  return result.rows;
}

module.exports = {
  create,
  findById,
  findByApiKey,
  findByUserId,
  countByUserId,
  updateContainer,
  updateStatus,
  deleteWorkspace,
  isOwner,
  findRunning,
  generateApiKey,
};
