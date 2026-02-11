/**
 * OpenClaw Proxy Routes
 * Proxies authenticated requests to OpenClaw containers
 * SECURITY: Validates API keys, checks subscriptions, no direct container access
 */

const express = require('express');
const proxy = require('express-http-proxy');
const workspaceModel = require('../models/workspace');
const subscriptionModel = require('../models/subscription');
const containerManager = require('../services/containerManager');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Middleware: Authenticate via API key and check subscription
 */
const authenticateApiKey = asyncHandler(async (req, res, next) => {
  // Extract API key from header
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'X-API-Key header is required',
    });
  }

  // Find workspace by API key
  const workspace = await workspaceModel.findByApiKey(apiKey);

  if (!workspace) {
    logger.warn('Invalid API key attempt', { apiKey: apiKey.substring(0, 8) + '...' });
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid API key',
    });
  }

  // Check if user has active subscription
  const hasActive = await subscriptionModel.hasActive(workspace.user_id);

  if (!hasActive) {
    return res.status(403).json({
      error: 'Subscription required',
      message: 'Active subscription required to access workspace',
    });
  }

  // Check if workspace container is running
  if (workspace.container_status !== 'running') {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'Workspace is not running. Please start the workspace first.',
      workspaceId: workspace.id,
      status: workspace.container_status,
    });
  }

  if (!workspace.container_id) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'Workspace container not initialized',
    });
  }

  // Get container IP address on internal network
  const containerIp = await containerManager.getContainerIp(workspace.container_id);

  if (!containerIp) {
    logger.error('Container IP not found', {
      workspaceId: workspace.id,
      containerId: workspace.container_id,
    });
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'Could not connect to workspace container',
    });
  }

  // Attach workspace info to request for logging and proxying
  req.workspace = workspace;
  const openclawPort = process.env.OPENCLAW_PORT || 8080;
  req.containerTarget = `http://${containerIp}:${openclawPort}`;

  next();
});

/**
 * Proxy handler using express-http-proxy
 * This library is designed for per-request dynamic targets
 */
router.use(
  '/:workspaceId',
  authenticateApiKey,
  proxy(
    (req) => {
      // Return target host (evaluated per request)
      // req.containerTarget was set by authenticateApiKey middleware
      if (!req.containerTarget) {
        logger.error('containerTarget not set in proxy handler', {
          workspaceId: req.workspace?.id,
        });
        throw new Error('Container target not configured');
      }
      logger.info('Proxying request', {
        workspaceId: req.workspace.id,
        target: req.containerTarget,
        originalPath: req.originalUrl,
      });
      return req.containerTarget;
    },
    {
      // Rewrite path: remove /api/proxy/:workspaceId prefix
      proxyReqPathResolver: (req) => {
        const workspaceId = req.workspace.id;
        const prefix = `/api/proxy/${workspaceId}`;
        const newPath = req.originalUrl.replace(prefix, '') || '/';
        logger.debug('Path rewrite', {
          original: req.originalUrl,
          rewritten: newPath,
        });
        return newPath;
      },

      // Modify proxy request options
      proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
        // Remove X-API-Key header (already authenticated)
        delete proxyReqOpts.headers['x-api-key'];
        return proxyReqOpts;
      },

      // Handle proxy response
      userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
        logger.info('OpenClaw response received', {
          workspaceId: userReq.workspace.id,
          statusCode: proxyRes.statusCode,
        });
        return proxyResData;
      },

      // Handle errors
      proxyErrorHandler: (err, res, next) => {
        logger.error('Proxy error', {
          error: err.message,
          stack: err.stack,
        });

        if (!res.headersSent) {
          res.status(502).json({
            error: 'Bad gateway',
            message: 'Failed to connect to workspace container',
            details: err.message,
          });
        }
      },
    }
  )
);

module.exports = router;
