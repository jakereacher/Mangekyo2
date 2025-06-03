const authController = require('./authController');
const otpController = require('./otpController');
const pageController = require('./pageController');
const passwordController = require('./passwordController');
const userController = require('./userController');
const cartController =  require('./cartController');
const profileController = require('./profileController');
const { uploadProfileImage } = require('../../helpers/multer');




module.exports = {
  // Auth related
  loadLoginpage: authController.loadLoginpage,
  login: authController.login,
  googleCallbackHandler: authController.googleCallbackHandler,
  logout: authController.logout,

  // OTP related
  generateOtp: otpController.generateOtp,
  sendVerificationEmail: otpController.sendVerificationEmail,
  verifyOtp: otpController.verifyOtp,
  resendOtp: otpController.resendOtp,

  // Page rendering
  pageNotFound: pageController.pageNotFound,
  loadHome: pageController.loadHome,
  loadLandingpage: pageController.loadLandingpage,
  loadSignUppage: pageController.loadSignUppage,
  loadShop: pageController.loadShop,
  loadProductDetail: pageController.loadProductDetail,

  // Password related
  securePassword: passwordController.securePassword,
  loadForgotPassword: passwordController.loadForgotPassword,
  resetPassword: passwordController.resetPassword,
  loadNewPassword: passwordController.loadNewPassword,
  newPassword: passwordController.newPassword,

  // User registration
  signup: userController.signup,

  // Cart related
  addToCart: cartController.addToCart,
  renderCartPage: cartController.renderCartPage,
  removeFromCart: cartController.removeFromCart,
  validateCart: cartController.validateCart,
  refreshCartPrices: cartController.refreshCartPrices,
  getCartCount: cartController.getCartCount,

// Profile related

  uploadProfileImage: uploadProfileImage, // Middleware for uploading profile images
  renderProfilePage: profileController.renderProfilePage, // Render profile page
  handleProfileUpdate: profileController.handleProfileUpdate, // Handle profile updates
  verifyEmailOtp:profileController.verifyEmailOTP,
  getCurrentPassword: profileController.getCurrentPassword, // Get current password
  changePassword: profileController.changePassword, // Change password

  // Address related
  handleAddress: profileController.handleAddress, // Handle address operations (add, update, delete, set default)
  getAddress: profileController.getAddress, // Get a specific address by ID
  updateAddress: profileController.updateAddress, // Update a specific address by ID
  deleteAddress: profileController.deleteAddress, // Delete a specific address by ID
  setDefaultAddress: profileController.setDefaultAddress, // Set a specific address as default


};