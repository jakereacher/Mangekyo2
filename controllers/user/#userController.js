const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const env = require("dotenv").config();
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const mongoose=require(`mongoose`)

const pageNotFound = async (req, res) => {
  try {
    res.render("page-404");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const loadSignUppage = async (req, res) => {
  try {
    return res.render("signup");
  } catch (error) {
    console.log("signup not found");
    res.status(500).send("server error");
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "verify your account",
      text: `Your OTP is ${otp}`,
      html: `<b> Your OTP:${otp}</b>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending email", error);
    return false;
  }
}

const loadLoginpage = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.render("login");
    } else {
      res.redirect("/home");
    }
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const loadHome = async (req, res) => {
  try {
    const userId = req.session.user;
    // if (!userId) {
    //   return res.redirect("/login");
    // }
    
    const userData = await User.findById(userId);
    const products = await Product.find({ 
      isBlocked: false,
      status: "Available" 
    })
    .sort({ createdAt: -1 })
    .limit(8);

    res.render("home", { 
      user: userData,
      products: products
    });
  } catch (error) {
    console.log("Home not found", error);
    res.status(500).send("server error");
  }
};

const loadLandingpage = async (req, res) => {
  try {
    if (req.session.user) {
      return res.redirect("/home");
    }
    return res.render("landing");
  } catch (error) {
    console.log("Landing page not found", error);
    res.status(500).send("server error");
  }
};

const signup = async (req, res) => {
  try {
    const { name, email, password, cPassword } = req.body;

    if (!email || !password || !cPassword) {
      return res.render("signup", { message: "All fields are required" });
    }

    // Trim whitespace and compare
    if (password.trim() !== cPassword.trim()) {
      return res.render("signup", { 
        message: "Passwords do not match",
        // Include these for debugging:
        previousInput: { name, email } 
      });
    }

    // Optional: Add password strength validation
    if (password.length < 8) {
      return res.render("signup", { 
        message: "Password must be at least 8 characters",
        previousInput: { name, email }
      });
    }

    const findUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (findUser) {
      return res.render("signup", { 
        message: "User already exists",
        previousInput: { name, email }
      });
    }

    // Rest of your existing code...
    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.render("signup", {
        message: "Failed to send OTP. Check email settings.",
        previousInput: { name, email }
      });
    }

    req.session.userOtp = otp;
    req.session.otpTimestamp = Date.now();
    req.session.userData = { 
      name: name.trim(), 
      email: email.trim().toLowerCase(), 
      password: password.trim() // Store trimmed version
    };
    res.render("verify-otp");
  } catch (error) {
    console.error("Signup error:", error);
    return res.redirect("/pageNotFound");
  }
};
const securePassword = async (password) => {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.error("Error hashing password:", error);
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const otpTimestamp = req.session.otpTimestamp;
    const currentTime = Date.now();
    const timeDifference = (currentTime - otpTimestamp) / 1000;

    if (!otpTimestamp || timeDifference > 120) {
      return res.status(400).json({ success: false, message: "OTP has expired" });
    }

    if (otp === req.session.userOtp) {
      const user = req.session.userData;
      const existingUser = await User.findOne({ email: user.email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "A user with this email already exists",
        });
      }

      const passwordHash = await securePassword(user.password);
      const saveUserData = new User({
        name: user.name,
        email: user.email,
        password: passwordHash,
      });
      await saveUserData.save();
      req.session.user = saveUserData._id;
      res.json({ success: true, redirectUrl: "/home" });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP" });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ success: false, message: "An error occurred during verification" });
  }
};

const resendOtp = async (req, res) => {
  try {
    const email = req.session.userData?.email;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email not found in session" });
    }

    const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpTimestamp = Date.now();

    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      console.log(' resend Otp in signup controller',otp);
      return res.status(200).json({ success: true, message: "OTP resent successfully" });
    } else {
      return res.status(500).json({ success: false, message: "Failed to resend OTP" });
      
    }
    
  }
   catch (error) {
    console.error("Error resending OTP:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const findUser = await User.findOne({ isAdmin: 0, email: email });
    if (!findUser) {
      return res.render("login", { message: "User not found" });
    }
    if (findUser.isBlocked) {
      return res.render("login", { message: "User is blocked by admin" });
    }
    const passwordMatch = await bcrypt.compare(password, findUser.password);

    if (!passwordMatch) {
      return res.render("login", { message: "Incorrect password" });
    }
    req.session.user = findUser._id;
    res.redirect("/home");
  } catch (error) {
    console.error("Login error", error);
    res.render("login", { message: "Login failed, please try again later" });
  }
};
const googleCallbackHandler = async (req, res) => {
  try {
    // Fetch the user from the database first
    const user = await User.findOne({ _id: req.user._id });
    if (!user) {
      return res.render("login", { message: "User not found" });
    }

    // Check if the user is blocked before setting the session
    if (user.isBlocked) {
      console.log("User is blocked:", user._id);
      // Destroy the session to ensure the user isn't logged in
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
          return res.redirect("/pageNotFound");
        }
        return res.render("login", { message: "User is blocked by admin" });
      });
      return; 
    }

    // If user is not blocked, set the session and proceed
    req.session.user = req.user._id;
    console.log("User logged in via Google:", req.user._id);
    res.redirect("/home");
  } catch (error) {
    console.error("Error in Google callback handler:", error);
    // Destroy session in case of error to prevent partial login states
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
      }
      res.redirect("/login");
    });
  }
};
const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log("Session destruction error", err);
        return res.redirect("/pageNotFound");
      }
      res.redirect("/login");
    });
  } catch (error) {
    console.log("Logout error", error);
    res.redirect("/pageNotFound");
  }
};

const loadForgotPassword = async (req, res) => {
  try {
    res.render("forgot-password", { message: "" });
  } catch (error) {
    console.log("Forgot password page not found", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "No account found" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    const resetTokenExpiry = Date.now() + 3600000;
    const otp = generateOtp();

    user.forgotPasswordOtp = resetToken;
    user.otpExpires = resetTokenExpiry;
    user.resetPasswordOtp = otp;
    await user.save();

    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(500).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({ 
      success: true, 
      message: "OTP sent to your email",
      token: resetToken,
      redirectUrl: `/newPassword?token=${resetToken}`
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};

const loadNewPassword = async (req, res) => {
  try {
    const { token } = req.query;
    const user = await User.findOne({
      forgotPasswordOtp: token,
      otpExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.render("forgot-password", { message: "Invalid or expired reset token" });
    }

    res.render("new-password", { token: token, message: "" });
  } catch (error) {
    console.error("Load new password error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const newPassword = async (req, res) => {
  try {
    const { token, otp, password } = req.body;
    const user = await User.findOne({
      forgotPasswordOtp: token,
      otpExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired token" });
    }

    if (user.resetPasswordOtp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    const hashedPassword = await securePassword(password);
    user.password = hashedPassword;
    user.forgotPasswordOtp = null;
    user.otpExpires = null;
    user.resetPasswordOtp = null;
    await user.save();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("New password error:", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};

const loadShop = async (req, res) => {
  try {
    const userId = req.session.user;
    
    const userData = await User.findById(userId);
    const {
      search = '',
      sort = 'default',
      category = 'all',
      min_price = 0,
      max_price = 2000,
      page = 1
    } = req.query;

    // Base query to filter available and unblocked products
    let query = {
      isBlocked: false,
      status: "Available"
    };

    // Add search filter if provided
    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }

    // Filter by category and ensure only listed categories are included
    if (category !== 'all') {
      let categoryArray = Array.isArray(category) ? category : category.split(',');
      const categories = await Category.find({ 
        name: { $in: categoryArray.map(cat => new RegExp(`^${cat}$`, 'i')) },
        isListed: true // Only listed categories
      });
      if (categories.length > 0) {
        query.category = { $in: categories.map(cat => cat._id) };
      } else {
        // If no listed categories match, return no products
        query.category = { $in: [] };
      }
    } else {
      // When category is 'all', only show products from listed categories
      const listedCategories = await Category.find({ isListed: true });
      query.category = { $in: listedCategories.map(cat => cat._id) };
    }

    // Add price range filter
    if (min_price || max_price) {
      query.salePrice = { $gte: parseFloat(min_price), $lte: parseFloat(max_price) };
    }

    // Define sort options
    let sortOption = {};
    switch (sort) {
      case 'price_asc': sortOption = { salePrice: 1 }; break;
      case 'price_desc': sortOption = { salePrice: -1 }; break;
      case 'name_asc': sortOption = { productName: 1 }; break;
      case 'name_desc': sortOption = { productName: -1 }; break;
      default: sortOption = { createdAt: -1 };
    }

    const perPage = 9;
    const skip = (page - 1) * perPage;

    // Fetch products with the updated query
    const products = await Product.find(query)
      .populate('category')
      .sort(sortOption)
      .skip(skip)
      .limit(perPage);

    // Fetch recommended products (also respecting listed categories)
    const listedCategories = await Category.find({ isListed: true });
    const recommendedProducts = await Product.find({
      isBlocked: false,
      status: "Available",
      category: { $in: listedCategories.map(cat => cat._id) } // Only from listed categories
    })
      .populate('category')
      .sort({ createdAt: -1 })
      .limit(4);

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / perPage);    const productData = products.map(product => ({
      _id: product._id,  // Added _id for product details link
      name: product.productName,
      image: product.productImage && product.productImage.length > 0 ? `/uploads/product-images/${product.productImage[0]}` : '/images/placeholder.jpg',
      category: product.category?.name || 'Uncategorized',
      price: product.salePrice,
      originalPrice: product.regularPrice,
      discount: product.offerPercentage > 0 ? product.offerPercentage : 0,
      isNew: (Date.now() - new Date(product.createdAt)) < (7 * 24 * 60 * 60 * 1000)
    }));

    const recommendedProductData = recommendedProducts.map(product => ({
      _id: product._id,  // Added _id for product details link
      name: product.productName,
      image: product.productImage && product.productImage.length > 0 ? `/uploads/product-images/${product.productImage[0]}` : '/images/placeholder.jpg',
      category: product.category?.name || 'Uncategorized',
      price: product.salePrice,
      originalPrice: product.regularPrice,
      discount: product.offerPercentage > 0 ? product.offerPercentage : 0,
      isNew: (Date.now() - new Date(product.createdAt)) < (7 * 24 * 60 * 60 * 1000)
    }));

    res.render("shop", {
      user: userData,
      products: productData,
      recommendedProducts: recommendedProductData,
      categories: listedCategories,
      query: req.query,
      currentPage: parseInt(page),
      totalPages,
      totalProducts
    });
  } catch (error) {
    console.log("Error loading shop:", error.message);
    res.redirect("/pageNotFound");
  }
};


const loadProductDetail = async (req, res) => {
  try {
    const userId=req.session.user;
    const userData = await User.findById(userId);
    const productId = req.params.id;

    // Validate the product ID
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.render("product-detail", { product: null, relatedProducts: [] });
    }

    const product = await Product.findById(productId)
      .populate('category');

    if (!product) {
      return res.render("product-detail", { product: null, relatedProducts: [] });
    }

    // Prepare product data regardless of status
    const productData = {
      _id: product._id,
      name: product.productName,
      description: product.description,
      image: product.productImage && product.productImage.length > 0 ? `/uploads/product-images/${product.productImage[0]}` : '/images/placeholder.jpg',
      gallery: product.productImage.map(img => `/uploads/product-images/${img}`),
      category: product.category?.name || 'Uncategorized',
      price: product.salePrice,
      originalPrice: product.regularPrice,
      discount: product.offerPercentage > 0 ? product.offerPercentage : 0,
      stock: product.quantity,
      isNew: (Date.now() - new Date(product.createdAt)) < (7 * 24 * 60 * 60 * 1000),
      rating: product.averageRating || 0,
      reviewCount: 0, // Placeholder
      coupons: [], // Placeholder
      highlights: [], // Placeholder
      specifications: {}, // Placeholder
      longDescription: product.description,
      reviews: [], // Placeholder
      ratingDistribution: null, // Placeholder
      isBlocked: product.isBlocked, // Pass blocked status
      status: product.status // Pass availability status
    };

    // Fetch related products
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      isBlocked: false,
      status: "Available"
    })
      .sort({ popularityScore: -1 })
      .limit(4)
      .select('productName productImage salePrice regularPrice offerPercentage createdAt');

    const relatedProductsData = relatedProducts.map(related => ({
      _id: related._id,
      name: related.productName,
      image: related.productImage && related.productImage.length > 0 ? `/uploads/product-images/${related.productImage[0]}` : '/images/placeholder.jpg',
      price: related.salePrice,
      originalPrice: related.regularPrice,
      discount: related.offerPercentage > 0 ? related.offerPercentage : 0,
      rating: related.averageRating || 0,
      reviewCount: 0,
      isNew: (Date.now() - new Date(related.createdAt)) < (7 * 24 * 60 * 60 * 1000)
    }));

    res.render("product-detail", {
      user:userData,
      product: productData,
      relatedProducts: relatedProductsData
    });
  } catch (error) {
    console.log("Error loading product detail:", error.message);
    res.render("product-detail", { product: null, relatedProducts: [] });
  }
};

module.exports = {
  loadHome,
  loadLandingpage,
  loadSignUppage,
  loadLoginpage,
  signup,
  verifyOtp,
  resendOtp,
  pageNotFound,
  login,
  googleCallbackHandler,
  logout,
  loadForgotPassword,
  resetPassword,
  loadNewPassword,
  newPassword,
  loadShop,
  // loadProductDetails,
  // loadProductsView,
  loadProductDetail
};