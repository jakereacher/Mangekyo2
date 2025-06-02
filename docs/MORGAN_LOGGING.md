# Morgan HTTP Request Logging Implementation

## Overview

This document describes the comprehensive Morgan HTTP request logging implementation for the Mangeyko e-commerce application. Morgan has been properly configured to provide detailed HTTP request logging with different strategies for development and production environments.

## Features Implemented

### ✅ **Environment-Based Logging**
- **Development**: Console logging with enhanced, readable format
- **Production**: File-based logging with comprehensive details

### ✅ **Custom Morgan Tokens**
- `user-id`: Tracks authenticated users or shows 'anonymous'
- `route-type`: Classifies requests as WEB, ADMIN, API, or AJAX
- `session-id`: Tracks user sessions (truncated for privacy)
- `req-size`: Shows request body size
- `user-agent-short`: Simplified browser identification

### ✅ **Multiple Log Files (Production)**
- `access.log`: All HTTP requests with full details
- `error.log`: Only 4xx and 5xx responses for debugging
- `api.log`: API-specific requests with focused metrics

### ✅ **Smart Filtering**
- Skips static files (CSS, JS, images) to reduce noise
- Excludes health checks and favicon requests
- Filters by response status for error logs

### ✅ **Log Rotation & Management**
- Automatic log rotation when files exceed 10MB
- Keeps 5 rotated files per log type
- **Daily cleanup of log files older than 1 day**
- **Log files are cleared (not deleted) to maintain active streams**
- Cron jobs for automated maintenance

## Log Formats

### Development Format
```
WEB GET / 200 10.839 ms - 5703 - User: anonymous - Firefox
```

### Production Access Log Format
```
::ffff:127.0.0.1 - 67fcd8733603b44ae5f4aecd [31/May/2025:11:47:08 +0000] "POST /login HTTP/1.1" 302 34 "http://localhost:3000/login" "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0" 212.716 ms - Session: y02MLEGb - Size: 61b
```

### Production Error Log Format
```
2025-05-31T11:47:08.939Z ERROR ::ffff:127.0.0.1 GET /api/placeholder/40/25 404 29.860 ms - User: 67fcd8733603b44ae5f4aecd - Session: y02MLEGb - "Mozilla/5.0..."
```

### Production API Log Format
```
2025-05-31T11:47:08.940Z API GET /api/placeholder/40/25 404 29.860 ms - User: 67fcd8733603b44ae5f4aecd - Size: 0b/84
```

## File Structure

```
├── config/
│   └── morgan.js              # Morgan configuration module
├── services/
│   └── logRotationService.js  # Log rotation cron service
├── utils/
│   └── logRotation.js         # Log rotation utilities
├── controllers/admin/
│   └── logController.js       # Admin log management (optional)
├── logs/                      # Log files directory (production)
│   ├── access.log
│   ├── error.log
│   └── api.log
└── docs/
    └── MORGAN_LOGGING.md      # This documentation
```

## Configuration Details

### Custom Tokens
```javascript
// User identification
morgan.token('user-id', (req) => {
  if (req.session?.user) {
    return req.session.user._id || req.session.user.toString() || 'authenticated';
  }
  return 'anonymous';
});

// Route classification
morgan.token('route-type', (req) => {
  if (req.originalUrl.startsWith('/admin')) return 'ADMIN';
  if (req.originalUrl.startsWith('/api')) return 'API';
  if (req.xhr || req.headers.accept?.includes('application/json')) return 'AJAX';
  return 'WEB';
});
```

### Skip Functions
```javascript
const skipStatic = (req, res) => {
  return req.url.startsWith('/public') ||
         req.url.startsWith('/images') ||
         req.url.startsWith('/css') ||
         req.url.startsWith('/js') ||
         req.url.startsWith('/uploads') ||
         req.url === '/favicon.ico' ||
         req.url === '/health' ||
         req.url === '/ping';
};
```

## Log Rotation

### Automatic Rotation
- **Trigger**: Files exceeding 10MB
- **Schedule**: Checked hourly via cron job
- **Retention**: 5 rotated files per log type

### Daily Log Cleanup
- **Schedule**: Daily at 2 AM
- **Retention**: 1 day (24 hours)
- **Method**: Log files are cleared (content removed) rather than deleted
- **Benefit**: Maintains active file streams while freeing disk space

### Manual Operations
```javascript
const { triggerRotation, triggerCleanup } = require('./services/logRotationService');

// Manually rotate logs when they exceed size limit
triggerRotation();

// Manually cleanup logs older than 1 day
triggerCleanup();
```

## Benefits

### 🚀 **Performance Monitoring**
- Response time tracking for all requests
- Request/response size monitoring
- Performance bottleneck identification

### 🔍 **User Behavior Tracking**
- User session tracking across requests
- Authentication state monitoring
- Route usage analytics

### 🛡️ **Security & Debugging**
- Error request logging for security analysis
- Failed authentication attempts tracking
- API usage monitoring

### 📊 **Analytics & Insights**
- Browser usage statistics
- Popular route identification
- Traffic pattern analysis

## Usage Examples

### Viewing Recent Logs
```bash
# View last 100 lines of access log
tail -n 100 logs/access.log

# View error logs in real-time
tail -f logs/error.log

# Search for specific user activity
grep "67fcd8733603b44ae5f4aecd" logs/access.log
```

### Log Analysis
```bash
# Count requests by status code
awk '{print $9}' logs/access.log | sort | uniq -c

# Find slowest requests
awk '{print $(NF-4), $0}' logs/access.log | sort -nr | head -10

# Count requests by user
grep -o 'User: [^ ]*' logs/access.log | sort | uniq -c
```

## Environment Variables

```env
NODE_ENV=development  # or 'production' for file logging
```

## Dependencies

- `morgan`: HTTP request logger middleware
- `node-cron`: Task scheduling for log rotation
- `fs`: File system operations for log management

## Best Practices

1. **Monitor log file sizes** regularly in production
2. **Set up log aggregation** for multiple server instances
3. **Implement log analysis tools** for insights
4. **Regular log cleanup** to prevent disk space issues
5. **Secure log files** with appropriate permissions

## Troubleshooting

### Common Issues
- **Large log files**: Ensure log rotation is working
- **Missing logs**: Check file permissions and disk space
- **Performance impact**: Verify static file filtering is working

### Log File Permissions
```bash
# Set appropriate permissions for log files
chmod 644 logs/*.log
chown www-data:www-data logs/*.log
```

This implementation provides comprehensive HTTP request logging that enhances monitoring, debugging, and analytics capabilities while maintaining optimal performance.
