/**
 * WishlistController
 */

const Wishlist = require('../../models/wishListSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');

//=================================================================================================
// Get Wishlist
//=================================================================================================
// This function gets the wishlist of a user.
// It gets the wishlist of a user.
//=================================================================================================
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
        populate: [
          {
            path: 'category',
            model: 'Category',
            populate: {
              path: 'offer',
              model: 'Offer'
            }
          },
          {
            path: 'offer',
            model: 'Offer'
          }
        ]
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

      const mainImage = product.productImage && product.productImage.length > 0
        ? product.productImage[0]
        : null;

      // Calculate pricing with offers
      const basePrice = product.price || 0;
      let finalPrice = basePrice;
      let hasOffer = false;
      let discountPercentage = 0;
      let discountAmount = 0;
      let discountType = null;

      // Check for product offers
      if (product.offer && product.offer.isActive &&
          new Date() >= new Date(product.offer.startDate) &&
          new Date() <= new Date(product.offer.endDate)) {
        hasOffer = true;
        discountType = product.offer.discountType;

        if (product.offer.discountType === 'percentage') {
          discountPercentage = product.offer.discountValue;
          discountAmount = (basePrice * discountPercentage) / 100;
          finalPrice = basePrice - discountAmount;
        } else if (product.offer.discountType === 'fixed') {
          discountAmount = product.offer.discountValue;
          finalPrice = Math.max(0, basePrice - discountAmount);
          discountPercentage = basePrice > 0 ? (discountAmount / basePrice) * 100 : 0;
        }
      }

      // Check for category offers if no product offer
      if (!hasOffer && product.category && product.category.offer &&
          product.category.offer.isActive &&
          new Date() >= new Date(product.category.offer.startDate) &&
          new Date() <= new Date(product.category.offer.endDate)) {
        hasOffer = true;
        discountType = product.category.offer.discountType;

        if (product.category.offer.discountType === 'percentage') {
          discountPercentage = product.category.offer.discountValue;
          discountAmount = (basePrice * discountPercentage) / 100;
          finalPrice = basePrice - discountAmount;
        } else if (product.category.offer.discountType === 'fixed') {
          discountAmount = product.category.offer.discountValue;
          finalPrice = Math.max(0, basePrice - discountAmount);
          discountPercentage = basePrice > 0 ? (discountAmount / basePrice) * 100 : 0;
        }
      }

      return {
        id: product._id.toString(),
        name: product.productName,
        description: product.description,
        category: product.category?.name || 'General',
        price: Math.round(basePrice),
        finalPrice: Math.round(finalPrice),
        originalPrice: hasOffer ? Math.round(basePrice) : null,
        discount: Math.round(discountPercentage),
        discountAmount: Math.round(discountAmount),
        discountType: discountType,
        hasOffer: hasOffer,
        image: mainImage,
        status: product.status,
        quantity: product.quantity || 0,
        addedOn: item.addedOn,
        badge: hasOffer ? (discountType === 'fixed' ? `₹${Math.round(discountAmount)} OFF` : `${Math.round(discountPercentage)}% OFF`) : null,
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

//=================================================================================================
// Add To Wishlist
//=================================================================================================
// This function adds a product to the wishlist of a user.
// It adds a product to the wishlist of a user.
//=================================================================================================
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

    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, products: [] });
    }

    const existingItem = wishlist.products.find(item =>
      item.productId && item.productId.toString() === productId
    );

    if (existingItem) {

      return res.json({
        success: true,
        message: 'Product is already in your wishlist',
        action: 'none'
      });
    }

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

//=================================================================================================
// Remove From Wishlist
//=================================================================================================
// This function removes a product from the wishlist of a user.
// It removes a product from the wishlist of a user.
//=================================================================================================
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

    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);

    if (isAjax) {
      res.json({
        success: true,
        message: 'Product removed from wishlist'
      });
    } else {

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

//=================================================================================================
// Toggle Wishlist
//=================================================================================================
// This function toggles a product in the wishlist of a user.
// It toggles a product in the wishlist of a user.
//=================================================================================================
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

    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, products: [] });
    }

    const existingItemIndex = wishlist.products.findIndex(item =>
      item.productId && item.productId.toString() === productId
    );

    let result;
    if (existingItemIndex > -1) {

      wishlist.products.splice(existingItemIndex, 1);
      result = {
        success: true,
        message: 'Product removed from wishlist',
        action: 'removed'
      };
    } else {

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

//=================================================================================================
// Remove From Wishlist On Add To Cart
//=================================================================================================
// This function removes a product from the wishlist of a user when it is added to the cart.
// It removes a product from the wishlist of a user when it is added to the cart.
//=================================================================================================
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

//=================================================================================================
// Get Wishlist Status
//=================================================================================================
// This function gets the status of a product in the wishlist of a user.
// It gets the status of a product in the wishlist of a user.
//=================================================================================================
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

//=================================================================================================
// Get Wishlist Count
//=================================================================================================
// This function gets the count of products in the wishlist of a user.
// It gets the count of products in the wishlist of a user.
//=================================================================================================
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
