const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');

const DEMO_ADMIN = {
  email: "demo_admin@example.com",
  password: "$2b$10$9mX.3dR7fGp5YQ6d8lzZpeY0YRfJQ9b3m8X1uD0vLk9rKs6VJ5XaC", // demoAdmin123 (pre-hashed)
  name: "Demo Admin",
  isAdmin: true,
  isDemo: true,
  _id: new mongoose.Types.ObjectId("6478a3b18bd2a6d999999992")
};

const loadLogin = (req,res) => {
  if(req.session.admin) return res.redirect("/admin/dashboard");
  res.render("admin-login", { message: null });
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body;


    // Regular Admin Login
    const admin = await User.findOne({ email, isAdmin: true });
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.render('admin-login', { message: 'Invalid credentials' });
    }

    req.session.admin = true;
    res.redirect('/admin/dashboard');

  } catch (error) {
    console.error('Login error:', error);
    res.render('admin-login', { message: 'Login failed' });
  }
};

const loadDashboard = async(req,res) => {
  if(!req.session.admin) return res.redirect("/admin/login");
  res.render("dashboard", { isDemoAdmin: req.session.isDemoAdmin || false });
}

const logout = (req,res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
}

const pageerror = (req,res) => res.render("admin-error");

module.exports = { loadLogin, login, loadDashboard, logout, pageerror };