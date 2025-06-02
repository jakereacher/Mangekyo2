const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

/**
 * Morgan HTTP Request Logging Configuration
 * Provides different logging strategies for development and production environments
 */

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom Morgan tokens for enhanced logging
morgan.token('user-id', (req) => {
  if (req.session?.user) {
    return req.session.user._id || req.session.user.toString() || 'authenticated';
  }
  return 'anonymous';
});

morgan.token('session-id', (req) => {
  return req.sessionID ? req.sessionID.substring(0, 8) : 'no-session';
});

morgan.token('req-size', (req) => {
  const size = req.get('content-length');
  return size ? `${size}b` : '0b';
});

morgan.token('user-agent-short', (req) => {
  const ua = req.get('user-agent') || '';
  // Extract browser name and version
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('Postman')) return 'Postman';
  if (ua.includes('curl')) return 'curl';
  return 'Other';
});

morgan.token('route-type', (req) => {
  if (req.originalUrl.startsWith('/admin')) return 'ADMIN';
  if (req.originalUrl.startsWith('/api')) return 'API';
  if (req.xhr || req.headers.accept?.includes('application/json')) return 'AJAX';
  return 'WEB';
});

// Custom logging formats
const formats = {
  // Production format - comprehensive logging
  production: ':remote-addr - :user-id [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms - Session: :session-id - Size: :req-size',

  // Development format - concise and readable
  development: ':route-type :method :url :status :response-time ms - :res[content-length] - User: :user-id - :user-agent-short',

  // Error format - detailed for debugging
  error: ':date[iso] ERROR :remote-addr :method :url :status :response-time ms - User: :user-id - Session: :session-id - ":user-agent"',

  // API format - focused on API metrics
  api: ':date[iso] API :method :url :status :response-time ms - User: :user-id - Size: :req-size/:res[content-length]'
};

// Skip functions for different scenarios
const skipFunctions = {
  // Skip static files and health checks
  static: (req, res) => {
    return req.url.startsWith('/public') ||
           req.url.startsWith('/images') ||
           req.url.startsWith('/css') ||
           req.url.startsWith('/js') ||
           req.url.startsWith('/uploads') ||
           req.url === '/favicon.ico' ||
           req.url === '/health' ||
           req.url === '/ping';
  },

  // Only log errors (4xx and 5xx)
  errorsOnly: (req, res) => res.statusCode < 400,

  // Only log successful requests
  successOnly: (req, res) => res.statusCode >= 400,

  // Only log API requests
  apiOnly: (req, res) => !req.originalUrl.startsWith('/api') && !req.xhr && !req.headers.accept?.includes('application/json')
};

/**
 * Get daily log file name with date suffix
 * @param {string} baseName - Base name for the log file
 * @returns {string} Log file name with date
 */
function getDailyLogFileName(baseName) {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
  return `${baseName}-${dateStr}.log`;
}

/**
 * Get log stream for daily rotating logs
 * @param {string} baseName - Base name for the log file
 * @returns {WriteStream} File write stream
 */
function getDailyLogStream(baseName) {
  const fileName = getDailyLogFileName(baseName);
  const filePath = path.join(logsDir, fileName);
  return fs.createWriteStream(filePath, { flags: 'a' });
}

/**
 * Configure Morgan middleware based on environment
 * @param {string} environment - The current environment (development, production, etc.)
 * @returns {Array} Array of Morgan middleware functions
 */
function configureMorgan(environment = process.env.NODE_ENV || 'development') {
  const middlewares = [];

  if (environment === 'production') {
    // Production: Log to daily rotating files

    // 1. General access log - daily rotation
    const accessLogStream = getDailyLogStream('access');
    middlewares.push(morgan(formats.production, {
      stream: accessLogStream,
      skip: skipFunctions.static
    }));

    // 2. Error log (4xx and 5xx responses) - daily rotation
    const errorLogStream = getDailyLogStream('error');
    middlewares.push(morgan(formats.error, {
      stream: errorLogStream,
      skip: skipFunctions.errorsOnly
    }));

    // 3. API-specific log - daily rotation
    const apiLogStream = getDailyLogStream('api');
    middlewares.push(morgan(formats.api, {
      stream: apiLogStream,
      skip: (req, res) => skipFunctions.apiOnly(req, res) || skipFunctions.static(req, res)
    }));

  } else {
    // Development: Log to console with colors
    middlewares.push(morgan(formats.development, {
      skip: skipFunctions.static
    }));

    // Also log errors separately in development for easier debugging
    middlewares.push(morgan(formats.error, {
      skip: skipFunctions.errorsOnly
    }));
  }

  return middlewares;
}

/**
 * Get log file paths for external access
 * @returns {Object} Object containing log file paths
 */
function getLogPaths() {
  return {
    access: path.join(logsDir, 'access.log'),
    error: path.join(logsDir, 'error.log'),
    api: path.join(logsDir, 'api.log'),
    directory: logsDir
  };
}

/**
 * Create a custom Morgan middleware for specific use cases
 * @param {string} format - The format to use
 * @param {Object} options - Morgan options
 * @returns {Function} Morgan middleware function
 */
function createCustomLogger(format, options = {}) {
  return morgan(format, options);
}

module.exports = {
  configureMorgan,
  getLogPaths,
  createCustomLogger,
  formats,
  skipFunctions
};
