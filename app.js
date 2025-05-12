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
const { initOfferCronJobs } = require('./services/offerCronService');




db();
// Initialize offer cron jobs
initOfferCronJobs();

app.use(flash());
app.use(express.json({ limit: '50mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

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


app.use("/admin", adminRouter);
app.use("/", userRouter);



app.set("view engine", "ejs");
app.set("views", [
  path.join(__dirname, "views/user"),
  path.join(__dirname, "views/admin"),
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

// Error handling middleware
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).render('error', {
//     message: 'Something went wrong!',
//     isAdmin: req.path.startsWith('/admin') // To use different error templates
//   });
// });



const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
