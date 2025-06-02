const cron = require('node-cron');
const { getLogPaths } = require('../config/morgan');
const { checkAndRotateLogs, cleanupOldLogs, cleanupLogFilesOlderThan } = require('../utils/logRotation');

/**
 * Log Rotation Service
 * Automatically rotates log files to prevent them from growing too large
 */

let rotationJob = null;
let cleanupJob = null;

/**
 * Initialize log rotation service
 * Sets up cron jobs to rotate and clean up log files
 */
function initLogRotation() {
  const logPaths = getLogPaths();
  const logFiles = [
    logPaths.access,
    logPaths.error,
    logPaths.api
  ];

  // Check for log rotation every hour
  rotationJob = cron.schedule('0 * * * *', () => {
    try {
      checkAndRotateLogs(logFiles, {
        maxSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5
      });
    } catch (error) {
      // Log rotation failed - continue silently
    }
  }, {
    scheduled: false // Don't start immediately
  });

  // Clean up old log files daily at 2 AM (clear files older than 1 day)
  cleanupJob = cron.schedule('0 2 * * *', () => {
    try {
      cleanupLogFilesOlderThan(logPaths.directory, 1); // 1 day
    } catch (error) {
      // Cleanup failed - continue silently
    }
  }, {
    scheduled: false // Don't start immediately
  });

  // Start the jobs only in production
  if (process.env.NODE_ENV === 'production') {
    rotationJob.start();
    cleanupJob.start();
  }
}

/**
 * Stop log rotation service
 */
function stopLogRotation() {
  if (rotationJob) {
    rotationJob.stop();
    rotationJob = null;
  }

  if (cleanupJob) {
    cleanupJob.stop();
    cleanupJob = null;
  }
}

/**
 * Manually trigger log rotation
 */
function triggerRotation() {
  const logPaths = getLogPaths();
  const logFiles = [
    logPaths.access,
    logPaths.error,
    logPaths.api
  ];

  checkAndRotateLogs(logFiles, {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  });
}

/**
 * Manually trigger log cleanup (1 day retention)
 */
function triggerCleanup() {
  const logPaths = getLogPaths();
  cleanupLogFilesOlderThan(logPaths.directory, 1);
}

/**
 * Manually trigger old log cleanup (rotation-based)
 */
function triggerOldLogCleanup() {
  const logPaths = getLogPaths();
  cleanupOldLogs(logPaths.directory, 5);
}

/**
 * Get rotation service status
 * @returns {Object} Status information
 */
function getRotationStatus() {
  return {
    rotationJobActive: rotationJob ? rotationJob.running : false,
    cleanupJobActive: cleanupJob ? cleanupJob.running : false,
    environment: process.env.NODE_ENV || 'development',
    enabled: process.env.NODE_ENV === 'production'
  };
}

module.exports = {
  initLogRotation,
  stopLogRotation,
  triggerRotation,
  triggerCleanup,
  triggerOldLogCleanup,
  getRotationStatus
};
