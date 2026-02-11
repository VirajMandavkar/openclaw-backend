/**
 * Input Validation Utilities
 * Validates inputs before processing to prevent security issues
 */

/**
 * Validate CPU limit
 * @param {string|number} cpuLimit - CPU limit (e.g., '1.0', '0.5', 2)
 * @returns {number} Validated CPU limit
 * @throws {Error} If invalid format or out of range
 */
function validateCpuLimit(cpuLimit) {
  const cpu = parseFloat(cpuLimit);

  if (isNaN(cpu)) {
    throw new Error(`Invalid CPU limit: ${cpuLimit}`);
  }

  if (cpu <= 0 || cpu > 8) {
    throw new Error(`CPU limit must be between 0 and 8 (got ${cpu})`);
  }

  return cpu;
}

/**
 * Validate memory limit
 * @param {string} memoryLimit - Memory limit (e.g., '512m', '1g', '256m')
 * @returns {string} Validated memory limit
 * @throws {Error} If invalid format
 */
function validateMemoryLimit(memoryLimit) {
  const match = String(memoryLimit).match(/^(\d+(?:\.\d+)?)(k|m|g)?$/i);

  if (!match) {
    throw new Error(`Invalid memory limit format: ${memoryLimit}`);
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'm').toLowerCase();

  // Convert to MB for validation
  const multipliers = { k: 1 / 1024, m: 1, g: 1024 };
  const memoryMB = value * multipliers[unit];

  // Min 128MB, Max 8GB
  if (memoryMB < 128 || memoryMB > 8192) {
    throw new Error(`Memory limit must be between 128m and 8g (got ${memoryLimit})`);
  }

  return memoryLimit;
}

/**
 * Validate workspace name
 * @param {string} name - Workspace name
 * @returns {string} Validated name
 * @throws {Error} If invalid
 */
function validateWorkspaceName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Workspace name is required');
  }

  if (name.length > 100) {
    throw new Error('Workspace name must be 100 characters or less');
  }

  // Only allow alphanumeric, hyphens, underscores, spaces
  if (!/^[a-zA-Z0-9\s_-]+$/.test(name)) {
    throw new Error('Workspace name can only contain letters, numbers, spaces, hyphens, and underscores');
  }

  return name.trim();
}

/**
 * Validate email length
 * @param {string} email - Email address
 * @returns {string} Validated email
 * @throws {Error} If too long
 */
function validateEmailLength(email) {
  if (typeof email !== 'string') {
    throw new Error('Email must be a string');
  }

  if (email.length > 255) {
    throw new Error('Email must be 255 characters or less');
  }

  return email;
}

/**
 * Validate password strength
 * @param {string} password - Password
 * @returns {string} Validated password
 * @throws {Error} If weak
 */
function validatePasswordStrength(password) {
  if (typeof password !== 'string') {
    throw new Error('Password must be a string');
  }

  if (password.length < 8 || password.length > 128) {
    throw new Error('Password must be between 8 and 128 characters');
  }

  // Check for required character types
  if (!/[a-z]/.test(password)) {
    throw new Error('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    throw new Error('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    throw new Error('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    throw new Error('Password must contain at least one special character');
  }

  return password;
}

module.exports = {
  validateCpuLimit,
  validateMemoryLimit,
  validateWorkspaceName,
  validateEmailLength,
  validatePasswordStrength,
};
