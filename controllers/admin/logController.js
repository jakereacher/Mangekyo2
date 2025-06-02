/**
 * Log Controller
 * Handles log viewing and management for admin users
 */

const fs = require('fs');
const path = require('path');
const { getLogPaths } = require('../../config/morgan');
const { getLogInfo, triggerRotation, triggerCleanup } = require('../../utils/logRotation');
const { getRotationStatus } = require('../../services/logRotationService');
const StatusCodes = require('../../utils/httpStatusCodes');

//=================================================================================================
// Get Logs Dashboard
//=================================================================================================
const getLogsDashboard = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    const logPaths = getLogPaths();
    const rotationStatus = getRotationStatus();
    
    // Get information about each log file
    const logInfo = {
      access: getLogInfo(logPaths.access),
      error: getLogInfo(logPaths.error),
      api: getLogInfo(logPaths.api)
    };

    res.render("admin/admin-logs", {
      activePage: "logs",
      logInfo,
      rotationStatus,
      logPaths
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/admin-error", {
      message: "Failed to load logs dashboard",
      activePage: "logs"
    });
  }
};

//=================================================================================================
// View Log File Content
//=================================================================================================
const viewLogFile = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Admin not authenticated"
      });
    }

    const { logType } = req.params;
    const { lines = 100 } = req.query;
    
    const logPaths = getLogPaths();
    let filePath;
    
    switch (logType) {
      case 'access':
        filePath = logPaths.access;
        break;
      case 'error':
        filePath = logPaths.error;
        break;
      case 'api':
        filePath = logPaths.api;
        break;
      default:
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Invalid log type"
        });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Log file not found"
      });
    }

    // Read last N lines of the file
    const content = fs.readFileSync(filePath, 'utf8');
    const allLines = content.split('\n').filter(line => line.trim());
    const lastLines = allLines.slice(-parseInt(lines));

    res.json({
      success: true,
      content: lastLines.join('\n'),
      totalLines: allLines.length,
      displayedLines: lastLines.length,
      fileInfo: getLogInfo(filePath)
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to read log file"
    });
  }
};

//=================================================================================================
// Trigger Log Rotation
//=================================================================================================
const rotateLogFiles = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Admin not authenticated"
      });
    }

    triggerRotation();

    res.json({
      success: true,
      message: "Log rotation triggered successfully"
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to rotate log files"
    });
  }
};

//=================================================================================================
// Trigger Log Cleanup
//=================================================================================================
const cleanupLogFiles = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Admin not authenticated"
      });
    }

    triggerCleanup();

    res.json({
      success: true,
      message: "Log cleanup triggered successfully"
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to cleanup log files"
    });
  }
};

//=================================================================================================
// Download Log File
//=================================================================================================
const downloadLogFile = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    const { logType } = req.params;
    const logPaths = getLogPaths();
    let filePath;
    let fileName;
    
    switch (logType) {
      case 'access':
        filePath = logPaths.access;
        fileName = 'access.log';
        break;
      case 'error':
        filePath = logPaths.error;
        fileName = 'error.log';
        break;
      case 'api':
        filePath = logPaths.api;
        fileName = 'api.log';
        break;
      default:
        return res.status(StatusCodes.BAD_REQUEST).send("Invalid log type");
    }

    if (!fs.existsSync(filePath)) {
      return res.status(StatusCodes.NOT_FOUND).send("Log file not found");
    }

    res.download(filePath, fileName);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Failed to download log file");
  }
};

//=================================================================================================
// Get Log Statistics
//=================================================================================================
const getLogStats = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Admin not authenticated"
      });
    }

    const logPaths = getLogPaths();
    const stats = {
      access: getLogInfo(logPaths.access),
      error: getLogInfo(logPaths.error),
      api: getLogInfo(logPaths.api),
      rotation: getRotationStatus()
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to get log statistics"
    });
  }
};

module.exports = {
  getLogsDashboard,
  viewLogFile,
  rotateLogFiles,
  cleanupLogFiles,
  downloadLogFile,
  getLogStats
};
