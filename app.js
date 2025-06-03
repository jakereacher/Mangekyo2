require("dotenv").config();
const express = require("express");
const app = express();
const path = require("path");
const morgan = require("morgan");
const https = require("https");
const http = require("http");
const fs = require("fs");
const passport = require("./config/passport");
const session = require("express-session");
const flash = require('connect-flash');
const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
const { initOfferCronJobs } = require('./services/newOfferCronService');
const { initLogRotation } = require('./services/logRotationService');
const { provideCartCount } = require('./middlewares/cartMiddleware');
const { handleApiErrors, handleApiNotFound } = require('./middlewares/errorHandler');




// Initialize database connection first
const initializeApp = async () => {
  try {
    await db();

    // Wait a bit for connection to be fully established
    setTimeout(() => {
      // Initialize offer cron jobs after database connection
      initOfferCronJobs();
      console.log('Cron jobs initialized after database connection');
    }, 2000);

    // Initialize log rotation service
    initLogRotation();
  } catch (error) {
    console.error('Failed to initialize application:', error);
  }
};

initializeApp();

//=================================================================================================
// Morgan HTTP Request Logging Configuration
//=================================================================================================

// Custom Morgan tokens for enhanced logging
morgan.token('user-id', (req) => {
  if (req.session?.user) {
    return req.session.user._id || req.session.user.toString() || 'authenticated';
  }
  return 'anonymous';
});

morgan.token('route-type', (req) => {
  if (req.originalUrl.startsWith('/admin')) return 'ADMIN';
  if (req.originalUrl.startsWith('/api')) return 'API';
  if (req.xhr || req.headers.accept?.includes('application/json')) return 'AJAX';
  return 'WEB';
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
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('Postman')) return 'Postman';
  if (ua.includes('curl')) return 'curl';
  return 'Other';
});

// Skip function for static files
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

// Configure Morgan based on environment
if (process.env.NODE_ENV === 'production') {
  // Production: Log to files with detailed information
  const fs = require('fs');
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // 1. General access log
  const accessLogStream = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });
  app.use(morgan(':remote-addr - :user-id [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms - Session: :session-id - Size: :req-size', {
    stream: accessLogStream,
    skip: skipStatic
  }));

  // 2. Error log (4xx and 5xx responses)
  const errorLogStream = fs.createWriteStream(path.join(logsDir, 'error.log'), { flags: 'a' });
  app.use(morgan(':date[iso] ERROR :remote-addr :method :url :status :response-time ms - User: :user-id - Session: :session-id - ":user-agent"', {
    stream: errorLogStream,
    skip: (req, res) => res.statusCode < 400 || skipStatic(req, res)
  }));

  // 3. API-specific log
  const apiLogStream = fs.createWriteStream(path.join(logsDir, 'api.log'), { flags: 'a' });
  app.use(morgan(':date[iso] API :method :url :status :response-time ms - User: :user-id - Size: :req-size/:res[content-length]', {
    stream: apiLogStream,
    skip: (req, res) => {
      const isApi = req.originalUrl.startsWith('/api') || req.xhr || req.headers.accept?.includes('application/json');
      return !isApi || skipStatic(req, res);
    }
  }));

} else {
  // Development: Log to console with enhanced format
  app.use(morgan(':route-type :method :url :status :response-time ms - :res[content-length] - User: :user-id - :user-agent-short', {
    skip: skipStatic
  }));

  // Also log errors separately in development for easier debugging
  app.use(morgan(':date[iso] ERROR :method :url :status :response-time ms - User: :user-id - :user-agent-short', {
    skip: (req, res) => res.statusCode < 400 || skipStatic(req, res)
  }));
}

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
    '/wallet/test',
    '/verify-otp',
    '/resend-otp'
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



// SSL certificate options
const sslOptions = {
  key: fs.readFileSync('/etc/letsencrypt/live/mangekyo.rohanjacob.store/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/mangekyo.rohanjacob.store/fullchain.pem'),
};

// Start HTTPS server on port 443
https.createServer(sslOptions, app).listen(443, () => {
  console.log('HTTPS server running on port 443');
});

// Redirect HTTP requests to HTTPS
http.createServer((req, res) => {
  res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
  res.end();
}).listen(80);

module.exports = app;
