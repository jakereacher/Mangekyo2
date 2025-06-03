const express = require("express");
const router = express.Router();
const passport = require("passport");
const { uploadProfileImage } = require("../helpers/multer");
const { userAuth } = require("../middlewares/auth");
const { validateInventory } = require("../middlewares/inventoryMiddleware");
const { checkExpiredOffers, updateProductOffers } = require("../middlewares/newOfferMiddleware");
const wishlistController = require("../controllers/user/wishlistController");
const checkoutController = require("../controllers/user/checkoutController");
const orderController = require("../controllers/user/orderController");
const couponController = require("../controllers/user/couponController");
const reviewController = require("../controllers/user/reviewController");
const razorpayController = require("../controllers/user/razorpayController");
const paymentController = require("../controllers/user/paymentController");
const walletController = require("../controllers/user/walletController");
const referralController = require("../controllers/user/referralController");
const deliveryController = require("../controllers/user/deliveryController");

const {
  loadLandingpage,
  loadSignUppage,
  loadLoginpage,
  loadHome,
  pageNotFound,
  loadForgotPassword,
  loadNewPassword,
  loadShop,
  loadProductDetail,
  signup,
  verifyOtp,
  resendOtp,
  login,
  logout,
  resetPassword,
  newPassword,
  googleCallbackHandler,
  addToCart,
  renderCartPage,
  removeFromCart,
  validateCart,
  refreshCartPrices,
  getCartCount,
  handleProfileUpdate,
  renderProfilePage,
  handleAddress,
  getAddress,
  verifyEmailOtp,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getCurrentPassword,
  changePassword

} = require("../controllers/user");


// Page Routes
router.get("/", loadLandingpage);
router.get("/signup", loadSignUppage);
router.get("/login", loadLoginpage);
router.get("/home", checkExpiredOffers, updateProductOffers, loadHome);
router.get("/pageNotFound", pageNotFound);
router.get("/forgot-password", loadForgotPassword);
router.get("/newPassword", loadNewPassword);
router.get("/shop", checkExpiredOffers, updateProductOffers, loadShop);
router.get("/shop/product/:id", checkExpiredOffers, loadProductDetail);

// Cart Routes
router.post("/add-to-cart",addToCart)
router.get("/cart", renderCartPage)
router.get("/cart/count", getCartCount)
router.patch("/remove-from-cart", removeFromCart);
router.post("/validate-cart", validateInventory, validateCart);
router.post("/refresh-cart-prices", refreshCartPrices);


router.get("/checkout", validateInventory, checkoutController.renderCheckoutPage);
router.post("/address", checkoutController.handleAddressSelection);

router.post("/checkout/place-order", validateInventory, checkoutController.placeOrder);
router.get("/orders/:orderId", orderController.getOrderDetails);

router.get("/orders",  orderController.getUserOrders);
router.get("/orders/:orderId", orderController.getOrderDetails);
router.get("/orders/:orderId/track", orderController.trackOrder);
router.get("/orders/:orderId/invoice",  orderController.downloadInvoice);
router.post("/orders/:orderId/cancel",  orderController.cancelOrder);
router.post("/orders/:orderId/cancel-all",  orderController.cancelAllItems);
router.post("/orders/:orderId/return",  orderController.requestReturn);
router.post("/orders/:orderId/complete-payment", orderController.completePayment);
//profile routes
router.get("/profile", renderProfilePage);
router.post("/profile/update", uploadProfileImage, handleProfileUpdate);
router.post("/profile/verify-email", verifyEmailOtp);
router.post("/profile/get-current-password", userAuth, getCurrentPassword);
router.post("/profile/change-password", userAuth, changePassword);

// Address routes
router.post("/profile/addresses", handleAddress);
router.get("/profile/addresses/:addressId", getAddress);
router.put('/addresses/:addressId', updateAddress); // Update address
router.delete('/addresses/:addressId', deleteAddress); // Delete address
router.patch('/addresses/:addressId/set-default', setDefaultAddress); // Set default address

//wishlist routes
router.get('/wishlist', wishlistController.getWishlist);
router.post('/wishlist/toggle', wishlistController.toggleWishlist);
router.delete('/wishlist/remove/:productId', wishlistController.removeFromWishlist);
router.get('/wishlist/status/:productId', wishlistController.getWishlistStatus);
router.get('/wishlist/count', wishlistController.getWishlistCount);

//review routes
router.post('/reviews/add', userAuth, reviewController.addReview);
router.get('/reviews/product/:productId', reviewController.getProductReviews);
router.get('/reviews/stats/:productId', reviewController.getReviewStats);
router.get('/reviews/can-review/:productId', reviewController.canUserReview);
router.delete('/reviews/delete/:reviewId', userAuth, reviewController.deleteReview);

// Delivery Charges
router.post("/calculate-delivery-charge", deliveryController.calculateDeliveryCharge);

// Coupons
router.get("/active-coupons", couponController.renderCouponsPage);
router.get("/coupon/:code", couponController.getCouponByCode);
router.get("/user-available-coupons", couponController.getUserAvailableCoupons);
router.post("/apply-coupon", couponController.applyCoupon);
router.post("/remove-coupon", couponController.removeAppliedCoupon);

// Razorpay Payment Routes
router.post("/razorpay/create-order", userAuth, razorpayController.createRazorpayOrder);
router.post("/razorpay/verify-payment", userAuth, razorpayController.verifyRazorpayPayment);
router.get("/razorpay/test", (req, res) => {
  const { razorpay, razorpayKeyId } = require("../config/razorpay");
  res.json({
    success: true,
    message: "Razorpay configuration test",
    keyId: razorpayKeyId,
    isInitialized: !!razorpay
  });
});

// Payment Success/Failure Routes
router.get("/payment/success/:orderId", paymentController.renderPaymentSuccess);
router.get("/payment/failure/:orderId", paymentController.renderPaymentFailure);

// Wallet Routes
router.post("/wallet/add-money", userAuth, walletController.addMoney);
router.post("/wallet/verify-payment", userAuth, walletController.verifyPayment);
router.get("/wallet/balance", userAuth, walletController.getWalletBalance);
router.get("/wallet/transactions", userAuth, walletController.getWalletTransactions);
router.get("/wallet/test", (req, res) => {
  res.json({
    success: true,
    message: "Wallet API is working",
    session: req.session ? { hasUser: !!req.session.user } : null
  });
});

// Referral Routes
router.get("/referral/code", userAuth, referralController.getReferralCode);
router.get("/referral/offer", referralController.getReferralOfferDetails);
router.get("/referral/stats", userAuth, referralController.getReferralStats);
router.post("/referral/apply", userAuth, referralController.applyReferralCode);


// Auth & User Management
router.post("/signup", signup);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/login", login);
router.post("/logout", logout);
router.post("/resetPassword", resetPassword);
router.post("/newPassword", newPassword);

// Google OAuth
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/signup" }),
  googleCallbackHandler
);

module.exports = router;
