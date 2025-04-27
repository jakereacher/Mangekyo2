const express = require("express");
const router = express.Router();
const passport = require("passport");
const { uploadProfileImage } = require("../helpers/multer");
const wishlistController = require("../controllers/user/wishlistController");



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
  handleProfileUpdate,
  renderProfilePage,
  handleAddress,
  getAddress,
  verifyEmailOtp,
} = require("../controllers/user"); 


// Page Routes
router.get("/", loadLandingpage);
router.get("/signup", loadSignUppage);
router.get("/login", loadLoginpage);
router.get("/home", loadHome);
router.get("/pageNotFound", pageNotFound);
router.get("/forgot-password", loadForgotPassword);
router.get("/newPassword", loadNewPassword);
router.get("/shop", loadShop);
router.get("/shop/product/:id", loadProductDetail);

// Cart Routes
router.post("/add-to-cart",addToCart)
router.get("/cart", renderCartPage)
router.patch("/remove-from-cart", removeFromCart);
router.post("/validate-cart", validateCart);
router.get("/checkout",(req,res)=>{
  res.render("checkout")
}
)


router.get("/profile", renderProfilePage);
router.post("/profile/update", uploadProfileImage, handleProfileUpdate);
router.post("/profile/verify-email", verifyEmailOtp);

// Address routes
router.post("/profile/addresses", handleAddress);
router.get("/profile/addresses/:addressId", getAddress);




router.get('/wishlist', wishlistController.getWishlist);
router.post('/wishlist/toggle', wishlistController.toggleWishlist);
router.delete('/wishlist/remove/:productId', wishlistController.removeFromWishlist);
router.get('/wishlist/status/:productId', wishlistController.getWishlistStatus);
router.get('/wishlist/count', wishlistController.getWishlistCount);

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


















// const express = require("express");
// const router = express.Router();
// const passport = require("passport");
// const userController = require("../controllers/user/userController");

// // Page Routes
// router.get("/", userController.loadLandingpage);
// router.get("/signup", userController.loadSignUppage);
// router.get("/login", userController.loadLoginpage);
// router.get("/home", userController.loadHome);
// router.get("/pageNotFound", userController.pageNotFound);
// router.get("/forgot-password", userController.loadForgotPassword);
// router.get("/newPassword", userController.loadNewPassword);
// router.get("/shop", userController.loadShop);
// router.get("/shop/product/:id", userController.loadProductDetail);

// // Auth & User Management
// router.post("/signup", userController.signup);
// router.post("/verify-otp", userController.verifyOtp);
// router.post("/resend-otp", userController.resendOtp);
// router.post("/login", userController.login);
// router.post("/logout", userController.logout);
// router.post("/resetPassword", userController.resetPassword);
// router.post("/newPassword", userController.newPassword);

// // Google OAuth Routes
// router.get(
//   "/auth/google",
//   passport.authenticate("google", { scope: ["profile", "email"] })
// );

// router.get(
//   "/auth/google/callback", // ✅ Correct callback path
//   passport.authenticate("google", { failureRedirect: "/signup" }),
//   userController.googleCallbackHandler // ✅ Custom logic for session & redirect
// );

// module.exports = router;
