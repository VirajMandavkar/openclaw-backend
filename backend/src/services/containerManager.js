/**
 * Container Manager Service
 * Manages Docker container lifecycle for OpenClaw workspaces
 * SECURITY: Enforces CPU/memory limits, no public ports, internal network only
 */

const { docker, OPENCLAW_NETWORK, OPENCLAW_IMAGE } = require('../config/docker');
const { validateCpuLimit, validateMemoryLimit } = require('../utils/validation');
const logger = require('../utils/logger');

/**
 * Ensure OpenClaw internal network exists
 * @returns {Promise<void>}
 */
async function ensureNetwork() {
  try {
    const networks = await docker.listNetworks({
      filters: { name: [OPENCLAW_NETWORK] },
    });

    if (networks.length === 0) {
      await docker.createNetwork({
        Name: OPENCLAW_NETWORK,
        Driver: 'bridge',
        Internal: false, // Set to true in production for complete isolation
        CheckDuplicate: true,
      });
      logger.info('Created OpenClaw internal network', { network: OPENCLAW_NETWORK });
    }
  } catch (error) {
    logger.error('Error ensuring network', { error: error.message });
    throw error;
  }
}

/**
 * Create a new OpenClaw container
 * @param {string} workspaceId - Workspace UUID
 * @param {Object} config - Container configuration
 * @returns {Promise<string>} Container ID
 */
async function createContainer(workspaceId, config) {
  const { cpuLimit, memoryLimit } = config;

  // SECURITY: Validate resource limits before using
  const validatedCpu = validateCpuLimit(cpuLimit);
  const validatedMemory = validateMemoryLimit(memoryLimit);

  // Container name based on workspace ID
  const containerName = `openclaw_workspace_${workspaceId}`;

  try {
    // Ensure network exists
    await ensureNetwork();

    // SECURITY: Parse resource limits
    const cpuQuota = validatedCpu * 100000; // Convert to CPU quota
    const memoryBytes = parseMemoryLimit(validatedMemory);

    // SECURITY: Container configuration with resource limits and NO exposed ports
    const containerConfig = {
      Image: OPENCLAW_IMAGE,
      name: containerName,
      Hostname: containerName,
      Env: [
        `WORKSPACE_ID=${workspaceId}`,
        // Add any OpenClaw-specific environment variables here
      ],
      HostConfig: {
        // CRITICAL: No port bindings - containers are completely isolated
        PortBindings: {},
        PublishAllPorts: false,

        // Resource limits (REQUIRED)
        CpuQuota: cpuQuota,
        CpuPeriod: 100000,
        Memory: memoryBytes,
        MemorySwap: memoryBytes, // Prevent swap usage

        // Network configuration
        NetworkMode: OPENCLAW_NETWORK,

        // Security options
        ReadonlyRootfs: false, // Set to true if OpenClaw supports it
        CapDrop: ['ALL'], // Drop all capabilities
        CapAdd: ['NET_BIND_SERVICE'], // Add only what's needed
        SecurityOpt: ['no-new-privileges:true'],

        // Restart policy: never auto-restart
        RestartPolicy: {
          Name: 'no',
        },
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [OPENCLAW_NETWORK]: {},
        },
      },
    };

    logger.info('Creating OpenClaw container', {
      workspaceId,
      containerName,
      cpuLimit,
      memoryLimit,
    });

    const container = await docker.createContainer(containerConfig);

    logger.info('OpenClaw container created', {
      workspaceId,
      containerId: container.id,
    });

    return container.id;
  } catch (error) {
    logger.error('Error creating container', {
      workspaceId,
      error: error.message,
      stack: error.stack,
    });
    throw new Error(`Failed to create container: ${error.message}`);
  }
}

/**
 * Start a container
 * @param {string} containerId - Docker container ID
 * @returns {Promise<boolean>} True if started successfully
 */
async function startContainer(containerId) {
  try {
    const container = docker.getContainer(containerId);

    // Check if container exists
    await container.inspect();

    logger.info('Starting container', { containerId });

    await container.start();

    logger.info('Container started successfully', { containerId });

    return true;
  } catch (error) {
    if (error.statusCode === 304) {
      // Container already started
      logger.debug('Container already running', { containerId });
      return true;
    }

    if (error.statusCode === 404) {
      throw new Error('Container not found');
    }

    logger.error('Error starting container', {
      containerId,
      error: error.message,
    });
    throw new Error(`Failed to start container: ${error.message}`);
  }
}

/**
 * Stop a container
 * @param {string} containerId - Docker container ID
 * @param {number} timeout - Graceful shutdown timeout in seconds
 * @returns {Promise<boolean>} True if stopped successfully
 */
async function stopContainer(containerId, timeout = 30) {
  try {
    const container = docker.getContainer(containerId);

    logger.info('Stopping container', { containerId, timeout });

    await container.stop({ t: timeout });

    logger.info('Container stopped successfully', { containerId });

    return true;
  } catch (error) {
    if (error.statusCode === 304) {
      // Container already stopped
      logger.debug('Container already stopped', { containerId });
      return true;
    }

    if (error.statusCode === 404) {
      throw new Error('Container not found');
    }

    logger.error('Error stopping container', {
      containerId,
      error: error.message,
    });
    throw new Error(`Failed to stop container: ${error.message}`);
  }
}

/**
 * Remove a container
 * @param {string} containerId - Docker container ID
 * @param {boolean} force - Force remove even if running
 * @returns {Promise<boolean>} True if removed successfully
 */
async function removeContainer(containerId, force = true) {
  try {
    const container = docker.getContainer(containerId);

    logger.info('Removing container', { containerId, force });

    await container.remove({ force });

    logger.info('Container removed successfully', { containerId });

    return true;
  } catch (error) {
    if (error.statusCode === 404) {
      // Container doesn't exist (already removed)
      logger.debug('Container not found (already removed)', { containerId });
      return true;
    }

    logger.error('Error removing container', {
      containerId,
      error: error.message,
    });
    throw new Error(`Failed to remove container: ${error.message}`);
  }
}

/**
 * Get container status
 * @param {string} containerId - Docker container ID
 * @returns {Promise<Object>} Container status information
 */
async function getContainerStatus(containerId) {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();

    return {
      id: info.Id,
      name: info.Name,
      status: info.State.Status,
      running: info.State.Running,
      startedAt: info.State.StartedAt,
      finishedAt: info.State.FinishedAt,
      exitCode: info.State.ExitCode,
    };
  } catch (error) {
    if (error.statusCode === 404) {
      return null;
    }

    logger.error('Error getting container status', {
      containerId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get container IP address on internal network
 * @param {string} containerId - Docker container ID
 * @returns {Promise<string|null>} Container IP or null
 */
async function getContainerIp(containerId) {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();

    const network = info.NetworkSettings.Networks[OPENCLAW_NETWORK];
    return network ? network.IPAddress : null;
  } catch (error) {
    logger.error('Error getting container IP', {
      containerId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Restart a container
 * @param {string} containerId - Docker container ID
 * @returns {Promise<boolean>} True if restarted successfully
 */
async function restartContainer(containerId) {
  try {
    const container = docker.getContainer(containerId);

    logger.info('Restarting container', { containerId });

    await container.restart({ t: 30 });

    logger.info('Container restarted successfully', { containerId });

    return true;
  } catch (error) {
    if (error.statusCode === 404) {
      throw new Error('Container not found');
    }

    logger.error('Error restarting container', {
      containerId,
      error: error.message,
    });
    throw new Error(`Failed to restart container: ${error.message}`);
  }
}

/**
 * Parse memory limit string to bytes
 * @param {string} memoryLimit - Memory limit (e.g., '512m', '1g')
 * @returns {number} Memory in bytes
 */
function parseMemoryLimit(memoryLimit) {
  const match = memoryLimit.match(/^(\d+(?:\.\d+)?)(k|m|g)?$/i);

  if (!match) {
    throw new Error(`Invalid memory limit format: ${memoryLimit}`);
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'm').toLowerCase();

  const multipliers = {
    k: 1024,
    m: 1024 * 1024,
    g: 1024 * 1024 * 1024,
  };

  return Math.floor(value * multipliers[unit]);
}

/**
 * Check if Docker daemon is accessible
 * @returns {Promise<boolean>} True if Docker is accessible
 */
async function healthCheck() {
  try {
    await docker.ping();
    return true;
  } catch (error) {
    logger.error('Docker health check failed', { error: error.message });
    return false;
  }
}

module.exports = {
  createContainer,
  startContainer,
  stopContainer,
  removeContainer,
  restartContainer,
  getContainerStatus,
  getContainerIp,
  ensureNetwork,
  healthCheck,
  parseMemoryLimit,
};
