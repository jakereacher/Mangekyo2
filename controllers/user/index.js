const authController = require('./authController');
const otpController = require('./otpController');
const pageController = require('./pageController');
const passwordController = require('./passwordController');
const userController = require('./userController');
const cartController =  require('./cartController');




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
};