const Cart = require('../models/cartSchema');

/**
 * Middleware to provide cart count to all views
 * This ensures that cart count is available in all EJS templates
 */
const provideCartCount = async (req, res, next) => {
  try {
    let cartCount = 0;
    
    // Only get cart count if user is logged in
    if (req.session && req.session.user) {
      const userId = req.session.user._id || req.session.user;
      const cart = await Cart.findOne({ userId });
      cartCount = cart ? cart.products.length : 0;
    }
    
    // Make cart count available to all views
    res.locals.cartCount = cartCount;
    next();
  } catch (error) {
    console.error('Error in cart count middleware:', error);
    // Set default cart count and continue
    res.locals.cartCount = 0;
    next();
  }
};

module.exports = {
  provideCartCount
};
