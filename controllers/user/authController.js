/**
 * Auth Controller
 */

const User = require("../../models/userSchema");
const bcrypt = require("bcrypt");



//=================================================================================================
// Load Login Page
//=================================================================================================
// This function loads the login page.
// It displays the login page.
//=================================================================================================
const loadLoginpage = async (req, res) => {
  try {
    if (!req.session.user) {
      // Get session message and clear it
      const sessionMessage = req.session.message;
      if (req.session.message) {
        delete req.session.message;
      }

      return res.render("login", {
        message: sessionMessage?.text || req.query.message
      });
    }
    res.redirect("/home");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

//=================================================================================================
// Login
//=================================================================================================
// This function logs in a user.
// It logs in a user to the database.
//=================================================================================================
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.render("login", {
        message: "User not found"
      });
    }

    if (user.isBlocked) {
      return res.render("login", {
        message: "Account is blocked"
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.render("login", {
        message: "Incorrect password"
      });
    }

    req.session.user = user._id;
    res.redirect("/home");
  } catch (error) {
    console.error("Login error:", error);
    res.render("login", {
      message: "Login failed. Please try again."
    });
  }
};

//=================================================================================================
// Google Callback Handler
//=================================================================================================
// This function handles the google callback.
// It handles the google callback.
//=================================================================================================
const googleCallbackHandler = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.user._id });
    if (!user) {
      return res.redirect("/login?message=User+not+found");
    }

    if (user.isBlocked) {
      req.session.destroy();
      return res.redirect("/login?message=Account+is+blocked");
    }

    req.session.user = user._id;
    res.redirect("/home");
  } catch (error) {
    console.error("Google auth error:", error);
    res.redirect("/login?message=Authentication+failed");
  }
};

//=================================================================================================
// Logout
//=================================================================================================
// This function logs out a user.
// It logs out a user from the database.
//=================================================================================================
const logout = async (req, res) => {
  try {
    req.session.destroy();
    res.redirect("/login");
  } catch (error) {
    console.error("Logout error:", error);
    res.redirect("/pageNotFound");
  }
};

//=================================================================================================
// Module Exports
//=================================================================================================
// This exports the auth controller functions.
// It exports the auth controller functions to be used in the user routes.
//=================================================================================================
module.exports = {
  loadLoginpage,
  login,
  googleCallbackHandler,
  logout
};









