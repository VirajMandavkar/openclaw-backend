/**
 * Logger Configuration
 * Winston logger with secret redaction
 * CRITICAL: Never logs API keys, passwords, tokens, or authorization headers
 */

const winston = require('winston');

// List of fields to redact from logs
const SECRET_FIELDS = [
  'password',
  'password_hash',
  'api_key',
  'apiKey',
  'apikey',
  'authorization',
  'token',
  'jwt',
  'secret',
  'x-api-key',
  'razorpay_key_secret',
  'RAZORPAY_KEY_SECRET',
  'JWT_SECRET',
];

/**
 * Redact sensitive information from objects
 * @param {*} obj - Object to redact
 * @returns {*} Redacted object
 */
function redactSecrets(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSecrets);
  }

  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSecret = SECRET_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()));

    if (isSecret) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSecrets(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

// Custom format to redact secrets (preserves Winston Symbol properties)
const redactFormat = winston.format((info) => {
  const redacted = redactSecrets(info);
  // Preserve Winston internal symbols that Object.entries() strips
  Object.getOwnPropertySymbols(info).forEach((sym) => {
    redacted[sym] = info[sym];
  });
  return redacted;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    redactFormat(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console output for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          let metaStr = '';
          if (Object.keys(meta).length > 0) {
            const filteredMeta = { ...meta };
            delete filteredMeta.timestamp;
            if (Object.keys(filteredMeta).length > 0) {
              metaStr = '\n' + JSON.stringify(filteredMeta, null, 2);
            }
          }
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    })
  );
}

module.exports = logger;
