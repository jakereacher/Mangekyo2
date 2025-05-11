const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');


// wishlistController.js
exports.getWishlist = async (req, res) => {
  try {
    const userId = req.session.user;

        const userData = await User.findById(userId);

    if (!userId) {
      return res.redirect('/login?message=Please+login+to+view+your+wishlist');
    }

    const wishlist = await Wishlist.findOne({ userId })
      .populate({
        path: 'products.productId',
        model: 'Product',
        populate: {
          path: 'category',
          model: 'Category'
        }
      })
      .exec();

    const cart = await Cart.findOne({ userId });
    const cartProductIds = cart ? cart.products.map(item => item.productId.toString()) : [];

    if (!wishlist) {
      const newWishlist = new Wishlist({ userId, products: [] });
      await newWishlist.save();
      return res.render('wishlist', {
        wishlist: [],
        cartItems: cartProductIds,
        user: req.user
      });
    }

    const wishlistItems = wishlist.products.map(item => {
      const product = item.productId;
      if (!product) return null;

      // Ensure image URLs are properly formatted
      const mainImage = product.productImage && product.productImage.length > 0
        ? product.productImage[0]
        : null;

      return {
        id: product._id.toString(),
        name: product.productName,
        description: product.description,
        category: product.category?.name || 'General',
        regularPrice: product.regularPrice,
        salePrice: product.salePrice,
        image: mainImage, // Just store the image filename
        status: product.status,
        quantity: product.quantity || 0,
        addedOn: item.addedOn,
        isOnOffer: product.productOffer,
        offerPercentage: product.offerPercentage,
        badge: product.productOffer ? `${product.offerPercentage}% OFF` : null,
        inCart: cartProductIds.includes(product._id.toString()),
        outOfStock: product.quantity <= 0
      };
    }).filter(Boolean);

    res.render('wishlist', {
      wishlist: wishlistItems,
      cartItems: cartProductIds,
      user:userData,
    });
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).render('error', { message: 'Failed to load wishlist', user: req.user });
  }
};

exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Please login to add items to wishlist'
      });
    }

    // Find or create wishlist
    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, products: [] });
    }

    // Check if product already exists in wishlist
    const existingItem = wishlist.products.find(item =>
      item.productId && item.productId.toString() === productId
    );

    if (existingItem) {
      // If product is already in wishlist, inform the client
      return res.json({
        success: true,
        message: 'Product is already in your wishlist',
        action: 'none'
      });
    }

    // Add product to wishlist
    wishlist.products.push({
      productId,
      addedOn: Date.now()
    });
    await wishlist.save();

    res.json({
      success: true,
      message: 'Product added to wishlist successfully',
      action: 'added'
    });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add to wishlist'
    });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Please login to remove items from wishlist'
      });
    }

    const wishlist = await Wishlist.findOne({ userId });
    if (wishlist) {
      wishlist.products = wishlist.products.filter(
        item => item.productId && item.productId.toString() !== productId
      );
      await wishlist.save();
    }

    // Determine if this is an AJAX request or a regular form submission
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);

    if (isAjax) {
      res.json({
        success: true,
        message: 'Product removed from wishlist'
      });
    } else {
      // Redirect back to wishlist page
      res.redirect('/wishlist');
    }
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove from wishlist'
    });
  }
};

// Toggle wishlist item (add if not present, remove if present)
exports.toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Please login to update your wishlist'
      });
    }

    // Find wishlist
    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, products: [] });
    }

    // Check if product exists in wishlist
    const existingItemIndex = wishlist.products.findIndex(item =>
      item.productId && item.productId.toString() === productId
    );

    let result;
    if (existingItemIndex > -1) {
      // Remove product from wishlist
      wishlist.products.splice(existingItemIndex, 1);
      result = {
        success: true,
        message: 'Product removed from wishlist',
        action: 'removed'
      };
    } else {
      // Add product to wishlist
      wishlist.products.push({
        productId,
        addedOn: Date.now()
      });
      result = {
        success: true,
        message: 'Product added to wishlist',
        action: 'added'
      };
    }

    await wishlist.save();
    res.json(result);
  } catch (error) {
    console.error('Error toggling wishlist item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update wishlist'
    });
  }
};

// Add a new method to handle removing products from wishlist when added to cart
exports.removeFromWishlistOnAddToCart = async (userId, productId) => {
  try {
    if (!userId) return false;

    const wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) return false;

    const productInWishlist = wishlist.products.find(item =>
      item.productId && item.productId.toString() === productId.toString()
    );

    if (productInWishlist) {
      wishlist.products = wishlist.products.filter(item =>
        !item.productId || item.productId.toString() !== productId.toString()
      );
      await wishlist.save();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error removing from wishlist after adding to cart:', error);
    return false;
  }
};

// Get wishlist status (for AJAX requests)
exports.getWishlistStatus = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.session.user;

    if (!userId) {
      return res.json({
        success: true,
        isInWishlist: false
      });
    }

    const wishlist = await Wishlist.findOne({ userId });
    const isInWishlist = wishlist && wishlist.products.some(item =>
      item.productId && item.productId.toString() === productId
    );

    res.json({
      success: true,
      isInWishlist
    });
  } catch (error) {
    console.error('Error checking wishlist status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check wishlist status'
    });
  }
};

// Count wishlist items
exports.getWishlistCount = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.json({
        success: true,
        count: 0
      });
    }

    const wishlist = await Wishlist.findOne({ userId });
    const count = wishlist && wishlist.products ? wishlist.products.length : 0;

    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Error counting wishlist items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to count wishlist items'
    });
  }
};