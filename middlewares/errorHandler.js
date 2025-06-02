/**
 * Error Handler Middleware
 *
 * This middleware handles errors and prevents raw JSON from being displayed in the browser.
 * It ensures that all API errors are properly formatted and user-friendly error pages are shown.
 */

const StatusCodes = require('../utils/httpStatusCodes');

/**
 * Middleware to handle JSON API errors and prevent raw JSON pages
 * @param {Object} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const handleApiErrors = (err, req, res, next) => {
  // Check if response has already been sent
  if (res.headersSent) {
    return next(err);
  }

  // List of API routes that should return JSON
  const apiRoutes = [
    '/add-to-cart', '/remove-from-cart', '/cart/count', '/validate-cart', '/refresh-cart-prices',
    '/checkout/place-order', '/razorpay/', '/wallet/', '/apply-coupon', '/remove-coupon',
    '/calculate-delivery-charge', '/wishlist/toggle', '/wishlist/status', '/wishlist/count'
  ];

  // Determine if this is an API request
  const isApiRequest = req.xhr ||
                      req.headers.accept?.includes('application/json') ||
                      req.headers['content-type']?.includes('application/json') ||
                      req.get('X-Requested-With') === 'XMLHttpRequest' ||
                      req.originalUrl.startsWith('/api/') ||
                      apiRoutes.some(route => req.originalUrl.includes(route));

  // For API requests, always return JSON
  if (isApiRequest) {
    res.setHeader('Content-Type', 'application/json');

    let statusCode = err.statusCode || err.status || StatusCodes.INTERNAL_SERVER_ERROR;
    let message = err.message || 'An error occurred';

    // Handle specific error types
    if (err.name === 'ValidationError') {
      statusCode = StatusCodes.BAD_REQUEST;
      message = 'Validation error: ' + err.message;
    } else if (err.name === 'CastError') {
      statusCode = StatusCodes.BAD_REQUEST;
      message = 'Invalid data format';
    } else if (err.code === 11000) {
      statusCode = StatusCodes.CONFLICT;
      message = 'Duplicate entry found';
    }

    return res.status(statusCode).json({
      success: false,
      message: message,
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }

  // For regular page requests, render error page
  const isAdminRequest = req.originalUrl.startsWith('/admin');

  if (isAdminRequest) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-error', {
      pageTitle: 'Error',
      message: 'Something went wrong!',
      error: process.env.NODE_ENV === 'development' ? err : undefined
    });
  } else {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('error', {
      pageTitle: 'Error',
      message: 'Something went wrong!',
      error: process.env.NODE_ENV === 'development' ? err : undefined
    });
  }
};

/**
 * Middleware to handle 404 errors for API routes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const handleApiNotFound = (req, res, next) => {
  // List of known API routes that should exist
  const knownApiRoutes = [
    '/add-to-cart',
    '/remove-from-cart',
    '/cart/count',
    '/validate-cart',
    '/refresh-cart-prices',
    '/checkout/place-order',
    '/razorpay/create-order',
    '/razorpay/verify-payment',
    '/wallet/add-money',
    '/wallet/verify-payment',
    '/wallet/balance',
    '/wallet/transactions',
    '/apply-coupon',
    '/remove-coupon',
    '/calculate-delivery-charge',
    '/wishlist/toggle',
    '/wishlist/status',
    '/wishlist/count'
  ];

  // Check if this is an API request
  const isApiRequest = req.xhr ||
                      req.headers.accept?.includes('application/json') ||
                      req.headers['content-type']?.includes('application/json') ||
                      req.get('X-Requested-With') === 'XMLHttpRequest' ||
                      req.originalUrl.startsWith('/api/');

  // Only return 404 for API requests that are NOT in our known routes
  if (isApiRequest && !knownApiRoutes.some(route => req.originalUrl.startsWith(route))) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: 'API endpoint not found',
      path: req.originalUrl
    });
  }

  // For regular requests or known API routes, continue to next middleware
  next();
};

/**
 * Middleware to handle checkout requests properly - prevent JSON pages for non-AJAX requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const ensureJsonForCheckout = (req, res, next) => {
  // Check if this is a checkout-related POST request
  if (req.method === 'POST' &&
      (req.originalUrl.includes('/checkout') ||
       req.originalUrl.includes('/razorpay') ||
       req.originalUrl.includes('/wallet'))) {

    // Check if this is an AJAX request
    const isAjaxRequest = req.xhr ||
                         req.headers.accept?.includes('application/json') ||
                         req.headers['content-type']?.includes('application/json') ||
                         req.get('X-Requested-With') === 'XMLHttpRequest';

    if (!isAjaxRequest) {
      // For non-AJAX requests, override res.json to force redirects
      const originalJson = res.json;
      res.json = function(data) {
        // Determine redirect URL based on the error
        let redirectUrl = '/cart';
        if (data.message && (data.message.includes('not authenticated') || data.message.includes('User not authenticated'))) {
          redirectUrl = '/login';
        } else if (data.message && data.message.includes('cart is empty')) {
          redirectUrl = '/cart';
        } else if (data.redirect) {
          redirectUrl = data.redirect;
        }

        // Set session message
        req.session.message = {
          type: 'error',
          text: data.message || 'An error occurred'
        };

        // Force redirect instead of JSON
        return res.redirect(redirectUrl);
      };
    }
  }

  next();
};

module.exports = {
  handleApiErrors,
  handleApiNotFound,
  ensureJsonForCheckout
};
