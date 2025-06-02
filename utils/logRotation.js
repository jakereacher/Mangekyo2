const fs = require('fs');
const path = require('path');

/**
 * Log Rotation Utility
 * Manages log file sizes and rotates them when they become too large
 */

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_FILES = 5;

/**
 * Check if a file needs rotation based on size
 * @param {string} filePath - Path to the log file
 * @param {number} maxSize - Maximum file size in bytes
 * @returns {boolean} True if file needs rotation
 */
function needsRotation(filePath, maxSize = DEFAULT_MAX_SIZE) {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const stats = fs.statSync(filePath);
    return stats.size >= maxSize;
  } catch (error) {
    return false;
  }
}

/**
 * Rotate a log file by renaming it and creating a new one
 * @param {string} filePath - Path to the log file
 * @param {number} maxFiles - Maximum number of rotated files to keep
 */
function rotateLogFile(filePath, maxFiles = DEFAULT_MAX_FILES) {
  try {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const basename = path.basename(filePath, ext);

    // Shift existing rotated files
    for (let i = maxFiles - 1; i >= 1; i--) {
      const oldFile = path.join(dir, `${basename}.${i}${ext}`);
      const newFile = path.join(dir, `${basename}.${i + 1}${ext}`);

      if (fs.existsSync(oldFile)) {
        if (i === maxFiles - 1) {
          // Delete the oldest file
          fs.unlinkSync(oldFile);
        } else {
          // Rename to next number
          fs.renameSync(oldFile, newFile);
        }
      }
    }

    // Move current file to .1
    const rotatedFile = path.join(dir, `${basename}.1${ext}`);
    fs.renameSync(filePath, rotatedFile);

    // Create new empty file
    fs.writeFileSync(filePath, '');

  } catch (error) {
    // Rotation failed - continue silently
  }
}

/**
 * Check and rotate log files if needed
 * @param {Array<string>} logFiles - Array of log file paths
 * @param {Object} options - Rotation options
 */
function checkAndRotateLogs(logFiles, options = {}) {
  const { maxSize = DEFAULT_MAX_SIZE, maxFiles = DEFAULT_MAX_FILES } = options;

  logFiles.forEach(filePath => {
    if (needsRotation(filePath, maxSize)) {
      rotateLogFile(filePath, maxFiles);
    }
  });
}

/**
 * Get log file information
 * @param {string} filePath - Path to the log file
 * @returns {Object} Log file information
 */
function getLogInfo(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        exists: false,
        size: 0,
        sizeFormatted: '0 B',
        lastModified: null
      };
    }

    const stats = fs.statSync(filePath);

    return {
      exists: true,
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      lastModified: stats.mtime,
      needsRotation: stats.size >= DEFAULT_MAX_SIZE
    };
  } catch (error) {
    return {
      exists: false,
      size: 0,
      sizeFormatted: '0 B',
      lastModified: null,
      error: error.message
    };
  }
}

/**
 * Format bytes to human readable format
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Clean up old rotated log files beyond the retention limit
 * @param {string} logDir - Directory containing log files
 * @param {number} maxFiles - Maximum number of files to keep
 */
function cleanupOldLogs(logDir, maxFiles = DEFAULT_MAX_FILES) {
  try {
    if (!fs.existsSync(logDir)) {
      return;
    }

    const files = fs.readdirSync(logDir);

    // Group files by base name
    const logGroups = {};
    files.forEach(file => {
      const match = file.match(/^(.+?)(?:\.(\d+))?\.log$/);
      if (match) {
        const baseName = match[1];
        const number = match[2] ? parseInt(match[2]) : 0;

        if (!logGroups[baseName]) {
          logGroups[baseName] = [];
        }

        logGroups[baseName].push({
          file,
          number,
          path: path.join(logDir, file)
        });
      }
    });

    // Clean up each group
    Object.values(logGroups).forEach(group => {
      // Sort by number (descending)
      group.sort((a, b) => b.number - a.number);

      // Remove files beyond the limit
      group.slice(maxFiles).forEach(item => {
        if (item.number > 0) { // Don't delete the main log file
          try {
            fs.unlinkSync(item.path);
          } catch (error) {
            // Failed to delete - continue
          }
        }
      });
    });

  } catch (error) {
    // Cleanup failed - continue silently
  }
}

/**
 * Clean up log files older than specified number of days
 * @param {string} logDir - Directory containing log files
 * @param {number} days - Number of days to keep files (files older than this will be deleted)
 */
function cleanupLogFilesOlderThan(logDir, days = 1) {
  try {
    if (!fs.existsSync(logDir)) {
      return;
    }

    const files = fs.readdirSync(logDir);
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000); // Convert days to milliseconds

    files.forEach(file => {
      // Only process .log files
      if (!file.endsWith('.log')) {
        return;
      }

      const filePath = path.join(logDir, file);

      try {
        const stats = fs.statSync(filePath);

        // Check if file is older than cutoff time
        if (stats.mtime.getTime() < cutoffTime) {
          // Clear the file content instead of deleting to avoid breaking active streams
          fs.writeFileSync(filePath, '');
        }
      } catch (error) {
        // Failed to process file - continue
      }
    });

  } catch (error) {
    // Cleanup failed - continue silently
  }
}

module.exports = {
  needsRotation,
  rotateLogFile,
  checkAndRotateLogs,
  getLogInfo,
  formatBytes,
  cleanupOldLogs,
  cleanupLogFilesOlderThan,
  DEFAULT_MAX_SIZE,
  DEFAULT_MAX_FILES
};
