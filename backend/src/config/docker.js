/**
 * Docker Configuration
 * Sets up Docker client for container management
 */

const Docker = require('dockerode');
require('dotenv').config();

// Initialize Docker client
// On Windows, dockerode auto-detects Docker Desktop if no options provided
// On Linux/Mac, it will use the default socket path
const dockerOptions = {};

// Only set socketPath on Linux/Mac (Unix socket)
if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.includes('npipe')) {
  dockerOptions.socketPath = process.env.DOCKER_HOST;
} else if (process.platform !== 'win32') {
  dockerOptions.socketPath = '/var/run/docker.sock';
}
// On Windows, leave options empty to let dockerode auto-detect Docker Desktop

const docker = new Docker(dockerOptions);

// Docker network name for OpenClaw containers
const OPENCLAW_NETWORK = process.env.OPENCLAW_NETWORK || 'openclaw_internal';

// OpenClaw Docker image
const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE || 'openclaw:latest';

module.exports = {
  docker,
  OPENCLAW_NETWORK,
  OPENCLAW_IMAGE,
};
