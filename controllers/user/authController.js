const User = require("../../models/userSchema");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const DEMO_USERS = {
  user: {
    _id: new mongoose.Types.ObjectId("6478a3b18bd2a6d999999991"),
    name: "Demo Customer",
    email: "demo_user@example.com",
    password: "$2b$10$V7.9dXZ7fGp5YQ6d8lzZpeY0YRfJQ9b3m8X1uD0vLk9rKs6VJ5XaC", // demoUser123
    isBlocked: false,
    isAdmin: false,
    isDemo: true,
    cart: [],
    wallet: 1000,
    Wishlist: [],
    orderHistory: [],
    createdOn: new Date()
  }
};

const loadLoginpage = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.render("login", { 
        demoUsers: DEMO_USERS,
        message: req.query.message 
      });
    }
    res.redirect("/home");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const login = async (req, res) => {
  try {
    const { email, password, isDemo } = req.body;

    
    if (isDemo) {
      let demoUser;
      if (email === DEMO_USERS.user.email) {
        demoUser = DEMO_USERS.user;
      } else if (email === DEMO_USERS.admin.email) {
        demoUser = DEMO_USERS.admin;
      } else {
        return res.render("login", { 
          message: "Invalid demo account", 
          demoUsers: DEMO_USERS 
        });
      }

    
      let user = await User.findById(demoUser._id);
      if (!user) {
        user = new User(demoUser);
        await user.save();
      }

      req.session.user = user._id;
      req.session.isDemo = true;
      return res.redirect("/home");
    }


    const user = await User.findOne({ email });
    
    if (!user) {
      return res.render("login", { 
        message: "User not found",
        demoUsers: DEMO_USERS 
      });
    }
    
    if (user.isBlocked) {
      return res.render("login", { 
        message: "Account is blocked",
        demoUsers: DEMO_USERS 
      });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.render("login", { 
        message: "Incorrect password",
        demoUsers: DEMO_USERS 
      });
    }

    req.session.user = user._id;
    req.session.isDemo = false;
    console.log(user._id)
    res.redirect("/home");
  } catch (error) {
    console.error("Login error:", error);
    res.render("login", { 
      message: "Login failed. Please try again.",
      demoUsers: DEMO_USERS 
    });
  }
};

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
    req.session.isDemo = false;
    res.redirect("/home");
  } catch (error) {
    console.error("Google auth error:", error);
    res.redirect("/login?message=Authentication+failed");
  }
};

const logout = async (req, res) => {
  try {
    req.session.destroy();
    res.redirect("/login");
  } catch (error) {
    console.error("Logout error:", error);
    res.redirect("/pageNotFound");
  }
};

module.exports = {
  loadLoginpage,
  login,
  googleCallbackHandler,
  logout
};