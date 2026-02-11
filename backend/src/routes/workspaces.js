/**
 * Workspace Routes
 * Handles workspace CRUD and lifecycle operations
 * SECURITY: Validates ownership, enforces subscription requirements
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const workspaceModel = require('../models/workspace');
const subscriptionModel = require('../models/subscription');
const containerManager = require('../services/containerManager');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { containerRateLimiter } = require('../middleware/rateLimiter');
const { validateWorkspaceName } = require('../utils/validation');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

/**
 * Middleware: Check workspace ownership
 */
async function checkOwnership(req, res, next) {
  const { id } = req.params;
  const userId = req.userId;

  const isOwner = await workspaceModel.isOwner(id, userId);

  if (!isOwner) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'You do not own this workspace',
    });
  }

  next();
}

/**
 * Middleware: Require active subscription
 */
async function requireSubscription(req, res, next) {
  const hasActive = await subscriptionModel.hasActive(req.userId);

  if (!hasActive) {
    return res.status(403).json({
      error: 'Subscription required',
      message: 'Active subscription required to perform this action',
      redirectTo: '/billing',
    });
  }

  next();
}

/**
 * GET /api/workspaces
 * List all workspaces for current user
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const workspaces = await workspaceModel.findByUserId(req.userId);

    // Remove sensitive container details from response
    const sanitizedWorkspaces = workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      status: ws.container_status,
      cpuLimit: ws.cpu_limit,
      memoryLimit: ws.memory_limit,
      createdAt: ws.created_at,
      lastStartedAt: ws.last_started_at,
    }));

    res.json({
      workspaces: sanitizedWorkspaces,
      count: sanitizedWorkspaces.length,
    });
  })
);

/**
 * GET /api/workspaces/:id
 * Get workspace details
 */
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Invalid workspace ID')],
  checkOwnership,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const workspace = await workspaceModel.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Workspace not found',
      });
    }

    // Include API key for owned workspace
    res.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        apiKey: workspace.api_key,
        status: workspace.container_status,
        cpuLimit: workspace.cpu_limit,
        memoryLimit: workspace.memory_limit,
        createdAt: workspace.created_at,
        lastStartedAt: workspace.last_started_at,
        proxyUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/proxy/${workspace.id}`,
      },
    });
  })
);

/**
 * POST /api/workspaces
 * Create a new workspace
 */
router.post(
  '/',
  requireSubscription,
  [
    body('name')
      .notEmpty()
      .withMessage('Workspace name is required')
      .isLength({ min: 1, max: 100 })
      .withMessage('Workspace name must be between 1 and 100 characters')
      .custom((value) => {
        validateWorkspaceName(value);
        return true;
      }),
    body('cpuLimit')
      .optional()
      .matches(/^(\d+(?:\.\d+)?)$/)
      .withMessage('CPU limit must be a number (e.g., 1.0, 0.5)'),
    body('memoryLimit')
      .optional()
      .matches(/^(\d+(?:\.\d+)?)(k|m|g)?$/i)
      .withMessage('Memory limit must be in format: 512m, 1g, etc.'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { name, cpuLimit, memoryLimit } = req.body;

    // Check workspace count limit
    const maxWorkspaces = parseInt(process.env.MAX_WORKSPACES_PER_USER) || 3;
    const currentCount = await workspaceModel.countByUserId(req.userId);

    if (currentCount >= maxWorkspaces) {
      return res.status(400).json({
        error: 'Limit reached',
        message: `Maximum ${maxWorkspaces} workspaces per user`,
      });
    }

    try {
      const workspace = await workspaceModel.create(req.userId, name, {
        cpuLimit,
        memoryLimit,
      });

      logger.info('Workspace created', {
        workspaceId: workspace.id,
        userId: req.userId,
        name,
      });

      res.status(201).json({
        message: 'Workspace created successfully',
        workspace: {
          id: workspace.id,
          name: workspace.name,
          apiKey: workspace.api_key,
          status: workspace.container_status,
          cpuLimit: workspace.cpu_limit,
          memoryLimit: workspace.memory_limit,
          createdAt: workspace.created_at,
          proxyUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/proxy/${workspace.id}`,
        },
      });
    } catch (error) {
      if (error.message === 'Workspace name already exists') {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Workspace with this name already exists',
        });
      }
      throw error;
    }
  })
);

/**
 * POST /api/workspaces/:id/start
 * Start a workspace container
 */
router.post(
  '/:id/start',
  [param('id').isUUID().withMessage('Invalid workspace ID')],
  checkOwnership,
  requireSubscription,
  containerRateLimiter,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const workspace = await workspaceModel.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Workspace not found',
      });
    }

    // Check if already running
    if (workspace.container_status === 'running') {
      return res.json({
        message: 'Workspace already running',
        workspace: {
          id: workspace.id,
          status: 'running',
          containerId: workspace.container_id,
        },
      });
    }

    try {
      let containerId = workspace.container_id;

      // If container doesn't exist, create it
      if (!containerId) {
        await workspaceModel.updateStatus(workspace.id, 'creating');

        containerId = await containerManager.createContainer(workspace.id, {
          cpuLimit: workspace.cpu_limit,
          memoryLimit: workspace.memory_limit,
        });

        await workspaceModel.updateContainer(workspace.id, {
          containerId,
          status: 'stopped',
        });
      }

      // Start the container
      await containerManager.startContainer(containerId);

      await workspaceModel.updateStatus(workspace.id, 'running');

      logger.info('Workspace started', {
        workspaceId: workspace.id,
        containerId,
        userId: req.userId,
      });

      res.json({
        message: 'Workspace started successfully',
        workspace: {
          id: workspace.id,
          status: 'running',
          containerId,
          startedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      await workspaceModel.updateStatus(workspace.id, 'error');
      logger.error('Failed to start workspace', {
        workspaceId: workspace.id,
        error: error.message,
      });
      throw error;
    }
  })
);

/**
 * POST /api/workspaces/:id/stop
 * Stop a workspace container
 */
router.post(
  '/:id/stop',
  [param('id').isUUID().withMessage('Invalid workspace ID')],
  checkOwnership,
  requireSubscription,
  containerRateLimiter,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const workspace = await workspaceModel.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Workspace not found',
      });
    }

    if (!workspace.container_id) {
      return res.status(400).json({
        error: 'Invalid operation',
        message: 'Workspace has no container to stop',
      });
    }

    // Check if already stopped
    if (workspace.container_status === 'stopped') {
      return res.json({
        message: 'Workspace already stopped',
        workspace: {
          id: workspace.id,
          status: 'stopped',
        },
      });
    }

    try {
      await containerManager.stopContainer(workspace.container_id);
      await workspaceModel.updateStatus(workspace.id, 'stopped');

      logger.info('Workspace stopped', {
        workspaceId: workspace.id,
        containerId: workspace.container_id,
        userId: req.userId,
      });

      res.json({
        message: 'Workspace stopped successfully',
        workspace: {
          id: workspace.id,
          status: 'stopped',
        },
      });
    } catch (error) {
      logger.error('Failed to stop workspace', {
        workspaceId: workspace.id,
        error: error.message,
      });
      throw error;
    }
  })
);

/**
 * DELETE /api/workspaces/:id
 * Delete a workspace and its container
 */
router.delete(
  '/:id',
  [param('id').isUUID().withMessage('Invalid workspace ID')],
  checkOwnership,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const workspace = await workspaceModel.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Workspace not found',
      });
    }

    try {
      // Remove container if it exists
      if (workspace.container_id) {
        await containerManager.removeContainer(workspace.container_id, true);
      }

      // Delete workspace from database
      await workspaceModel.deleteWorkspace(workspace.id);

      logger.info('Workspace deleted', {
        workspaceId: workspace.id,
        userId: req.userId,
      });

      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete workspace', {
        workspaceId: workspace.id,
        error: error.message,
      });
      throw error;
    }
  })
);

module.exports = router;
