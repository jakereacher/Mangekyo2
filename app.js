require("dotenv").config();
const express = require("express");
const app = express();
const path = require("path");
const passport = require("./config/passport");
const session = require("express-session");
const flash = require('connect-flash');
const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
const { initOfferCronJobs } = require('./services/newOfferCronService');
const { provideCartCount } = require('./middlewares/cartMiddleware');
const { handleApiErrors, handleApiNotFound } = require('./middlewares/errorHandler');




db();
// Initialize offer cron jobs
initOfferCronJobs();

app.use(flash());
app.use(express.json({ limit: '50mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Serve favicon.ico from root path
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/images/favicon/favicon.ico'));
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 72 * 60 * 60 * 1000,
    },
  })
);





app.use((req, res, next) => {
  res.locals.message = req.session.message;
  delete req.session.message;
  next();
});


app.use(passport.initialize());
app.use(passport.session());


app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// Add cart count middleware for user routes
app.use(provideCartCount);

// AGGRESSIVE middleware to prevent ALL JSON pages in browser (except for real AJAX API routes)
app.use((req, res, next) => {
  // Routes that should ALWAYS return JSON (for AJAX calls)
  const allowedJsonRoutes = [
    '/api/',
    '/admin/api/',
    '/cart/count',
    '/wishlist/count',
    '/wishlist/status',
    '/wishlist/toggle',
    '/add-to-cart',
    '/remove-from-cart',
    '/validate-cart',
    '/refresh-cart-prices',
    '/apply-coupon',
    '/remove-coupon',
    '/calculate-delivery-charge',
    '/wallet/balance',
    '/wallet/transactions',
    '/razorpay/test',
    '/wallet/test'
  ];

  // Check if this is a real API route that should return JSON
  const isApiRoute = allowedJsonRoutes.some(route => req.originalUrl.includes(route)) ||
                    req.originalUrl.startsWith('/api/') ||
                    req.originalUrl.startsWith('/admin/api/');

  if (!isApiRoute) {
    // Check if this is an AJAX request
    const isAjaxRequest = req.xhr ||
                         req.headers.accept?.includes('application/json') ||
                         req.headers['content-type']?.includes('application/json') ||
                         req.get('X-Requested-With') === 'XMLHttpRequest' ||
                         req.headers['x-requested-with'] === 'XMLHttpRequest';

    if (!isAjaxRequest) {
      // For ALL non-AJAX, non-API routes, override res.json to prevent JSON pages
      const originalJson = res.json;
      res.json = function(data) {
        console.warn('🚫 BLOCKING JSON page for non-AJAX browser request:', req.originalUrl, 'Data:', data);

      // Determine redirect URL based on the error and route
      let redirectUrl = '/';

      if (data && data.message) {
        if (data.message.includes('not authenticated') || data.message.includes('User not authenticated') || data.message.includes('not logged in')) {
          redirectUrl = '/login';
        } else if (data.message.includes('cart is empty') || data.message.includes('cart')) {
          redirectUrl = '/cart';
        } else if (req.originalUrl.includes('checkout')) {
          redirectUrl = '/checkout';
        } else if (req.originalUrl.includes('profile')) {
          redirectUrl = '/profile';
        } else if (req.originalUrl.includes('orders')) {
          redirectUrl = '/orders';
        } else if (req.originalUrl.includes('wishlist')) {
          redirectUrl = '/wishlist';
        } else if (data.redirect) {
          redirectUrl = data.redirect;
        }
      } else if (data && data.redirect) {
        redirectUrl = data.redirect;
      }

      // Set session message
      req.session.message = {
        type: (data && data.success) ? 'success' : 'error',
        text: (data && data.message) || 'An error occurred'
      };

      console.warn('🔄 Redirecting to:', redirectUrl, 'with message:', req.session.message.text);

        // Force redirect instead of JSON
        return res.redirect(redirectUrl);
      };

      // Also override res.status().json() chain
      const originalStatus = res.status;
      res.status = function(statusCode) {
        const statusResult = originalStatus.call(this, statusCode);

        // Override the json method on the returned object
        const originalStatusJson = statusResult.json;
        statusResult.json = function(data) {
          console.warn('🚫 BLOCKING JSON page for non-AJAX browser request (via status):', req.originalUrl, 'Status:', statusCode, 'Data:', data);

        // Use the same logic as above
        let redirectUrl = '/';

        if (data && data.message) {
          if (data.message.includes('not authenticated') || data.message.includes('User not authenticated') || data.message.includes('not logged in')) {
            redirectUrl = '/login';
          } else if (data.message.includes('cart is empty') || data.message.includes('cart')) {
            redirectUrl = '/cart';
          } else if (req.originalUrl.includes('checkout')) {
            redirectUrl = '/checkout';
          } else if (req.originalUrl.includes('profile')) {
            redirectUrl = '/profile';
          } else if (req.originalUrl.includes('orders')) {
            redirectUrl = '/orders';
          } else if (req.originalUrl.includes('wishlist')) {
            redirectUrl = '/wishlist';
          } else if (data.redirect) {
            redirectUrl = data.redirect;
          }
        } else if (data && data.redirect) {
          redirectUrl = data.redirect;
        }

        // Set session message
        req.session.message = {
          type: (data && data.success) ? 'success' : 'error',
          text: (data && data.message) || 'An error occurred'
        };

        console.warn('🔄 Redirecting to:', redirectUrl, 'with message:', req.session.message.text);

        // Force redirect instead of JSON
        return res.redirect(redirectUrl);
      };

      return statusResult;
    };
    }
  }

  next();
});

app.use("/admin", adminRouter);
app.use("/", userRouter);

// Handle API 404s after regular routes
app.use(handleApiNotFound);



app.set("view engine", "ejs");
app.set("views", [
  path.join(__dirname, "views/user"),
  path.join(__dirname, "views/admin"),
  path.join(__dirname, "views"), // Add root views directory
]);


app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/admin")) return next();
  res.status(404).render("page-404", {
    pageTitle: "Page Not Found",
    path: req.originalUrl,
    user: true,
  });
});


app.use((req, res) => {
  res.status(404).render("admin-error", {
    pageTitle: "Admin Page Not Found",
    path: req.originalUrl,
    admin: true,
  });
});

// Error handling middleware - use our custom error handler
app.use(handleApiErrors);



const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
