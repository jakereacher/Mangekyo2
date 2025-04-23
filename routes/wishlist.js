const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');

// Toggle product in wishlist
router.post('/api/wishlist/toggle', isLoggedIn, async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user._id;

    // Validate product ID
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const user = await User.findById(userId);
    const index = user.wishlist.indexOf(productId);

    if (index === -1) {
      // Add to wishlist
      user.wishlist.push(productId);
      await user.save();
      return res.json({ 
        success: true, 
        message: 'Product added to wishlist',
        action: 'added'
      });
    } else {
      // Remove from wishlist
      user.wishlist.splice(index, 1);
      await user.save();
      return res.json({ 
        success: true, 
        message: 'Product removed from wishlist',
        action: 'removed'
      });
    }
  } catch (error) {
    console.error('Wishlist toggle error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get user's wishlist
router.get('/api/wishlist', isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('wishlist');
    res.json({ success: true, wishlist: user.wishlist });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;