const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const wishlistController = require('./wishlistController');

exports.addToCart = async (req, res) => {
  try {
    console.log("Add to cart request body:", req.body);
    const { productId, quantity = 1 } = req.body;
    console.log("Extracted productId and quantity:", { productId, quantity });

    // Check if user is logged in
    if (!req.session || !req.session.user) {
      console.log("User not logged in");
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not logged in",
      });
    }

    // Get user ID from session
    const userId = req.session.user._id || req.session.user;
    console.log("User ID from session:", userId);

    const product = await Product.findById(productId).populate('offer');
    if (!product) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Product not found",
      });
    }

    if (quantity > 6) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Cannot add more than 6",
      });
    }

    // Check if product is in stock
    if (product.quantity <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "This product is currently out of stock",
        outOfStock: true
      });
    }

    // Check if requested quantity is available
    if (product.quantity < quantity) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `Only ${product.quantity} items available in stock. You requested ${quantity}.`,
        availableStock: product.quantity,
        requestedQuantity: quantity
      });
    }

    let cart = await Cart.findOne({ userId });

    // Get the best offer price using offerService
    const offerService = require('../../services/offerService');
    const basePrice = product.price || 0;

    // Get the best offer for this product
    const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);

    // Use the final price after applying the best offer
    let price = offerResult.finalPrice;

    // Ensure price is not negative
    if (price < 0) price = 0;

    const totalPrice = price * quantity;

    if (!cart) {
      cart = new Cart({
        userId,
        products: [{ productId, quantity, price, totalPrice }],
      });

      await cart.save();

      // Remove from wishlist if present
      await wishlistController.removeFromWishlistOnAddToCart(userId, productId);

      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Product added to new cart",
        cartCount: cart.products.length,
      });
    }

    const existingItem = cart.products.find(
      (item) => item.productId.toString() === productId
    );

    if (existingItem) {
      existingItem.quantity = quantity;
      existingItem.totalPrice = price * quantity;

      if (existingItem.quantity > 6) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Cannot add more than 6",
        });
      }
    } else {
      if (cart.products.length >= 9) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Your cart reached maximum limit.",
        });
      }

      cart.products.push({ productId, quantity, price, totalPrice });
    }

    await cart.save();

    // Remove from wishlist if present (only for new additions)
    if (!existingItem) {
      await wishlistController.removeFromWishlistOnAddToCart(userId, productId);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Product added to cart",
      cartCount: cart.products.length,
    });

  } catch (error) {
    console.error("Add to Cart Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// Helper function to refresh cart prices based on current offers
const refreshCartPrices = async (userId) => {
  try {
    const cart = await Cart.findOne({ userId });
    if (!cart || !cart.products || cart.products.length === 0) {
      return { updated: false, cart: null };
    }

    const offerService = require('../../services/offerService');
    let pricesUpdated = false;

    // Check each product in the cart for price changes
    for (const item of cart.products) {
      const product = await Product.findById(item.productId);
      if (!product) continue;

      // Get current best offer price
      const basePrice = product.price || 0;
      const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);
      const currentBestPrice = offerResult.finalPrice;

      // Check if price has changed (using small threshold for floating point comparison)
      const priceDifference = Math.abs(item.price - currentBestPrice);
      const shouldUpdatePrice = priceDifference > 0.01; // 1 cent threshold

      if (shouldUpdatePrice) {
        console.log(`Updating cart price for ${product.productName}: Old price: ${item.price}, New price: ${currentBestPrice}`);

        // Update item price and total price
        item.price = currentBestPrice;
        item.totalPrice = currentBestPrice * item.quantity;
        pricesUpdated = true;
      }
    }

    // Save cart if any prices were updated
    if (pricesUpdated) {
      await cart.save();
      console.log(`Cart prices updated for user ${userId}`);
    }

    return { updated: pricesUpdated, cart };
  } catch (error) {
    console.error('Error refreshing cart prices:', error);
    return { updated: false, error };
  }
};

exports.renderCartPage = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    // Refresh cart prices based on current offers
    const { updated, cart, error } = await refreshCartPrices(userId);

    // If there was an error refreshing prices, just proceed with the current cart
    const currentCart = error ? await Cart.findOne({ userId }) : cart;
    const allProducts = await Product.find({ isDeleted: false });
    let cartProducts = [];

    if (currentCart && currentCart.products && currentCart.products.length > 0) {
      const sortedCartProducts = currentCart.products.sort(
        (a, b) => new Date(b.added_at) - new Date(a.added_at)
      );

      cartProducts = await Promise.all(
        sortedCartProducts.map(async (item) => {
          const productDetails = await Product.findById(item.productId);
          if (!productDetails) return null;

          // Get the current offer price to compare with the stored cart price
          const offerService = require('../../services/offerService');
          const basePrice = productDetails.price || 0;
          const offerResult = await offerService.getBestOfferForProduct(productDetails._id, basePrice);

          return {
            product: productDetails,
            quantity: item.quantity,
            added_at: item.added_at,
            price: item.price,
            totalPrice: item.totalPrice,
            currentPrice: offerResult.finalPrice,
            priceChanged: Math.abs(item.price - offerResult.finalPrice) > 0.01
          };
        })
      );

      cartProducts = cartProducts.filter((item) => item !== null);
    }

    const cartCount = currentCart ? currentCart.products.length : 0;
    const pricesUpdated = updated;

    return res.render("cart", {
      name: "", // Can't access user name if session only stores userId
      userId,
      cartProducts,
      products: allProducts,
      cartCount,
      pricesUpdated
    });
  } catch (error) {
    console.error("Error rendering cart page:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.session?.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not logged in",
      });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Cart not found",
      });
    }

    const productIndex = cart.products.findIndex(
      (item) => item.productId.toString() === productId
    );

    if (productIndex === -1) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Product not found in cart",
      });
    }

    cart.products.splice(productIndex, 1); // Remove product
    await cart.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Product removed from cart",
      cartCount: cart.products.length,
    });

  } catch (error) {
    console.error("Remove from Cart Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

// API endpoint to refresh cart prices
exports.refreshCartPrices = async (req, res) => {
  try {
    const userId = req.session?.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const { updated, cart, error } = await refreshCartPrices(userId);

    if (error) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to refresh cart prices",
      });
    }

    if (!cart) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Cart not found or empty",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      updated,
      message: updated ? "Cart prices updated successfully" : "Cart prices are already up to date",
    });
  } catch (error) {
    console.error("Error refreshing cart prices:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error refreshing cart prices",
    });
  }
};

exports.validateCart = async (req, res) => {
  try {
    const userId = req.session?.user;

    if (!userId) {
      console.log('User not authenticated');
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Not authenticated",
      });
    }

    // First refresh cart prices to ensure we're working with the latest prices
    await refreshCartPrices(userId);

    console.log(`User ${userId} authenticated. Fetching cart...`);
    const cart = await Cart.findOne({ userId }).lean();

    if (!cart || !cart.products || cart.products.length === 0) {
      console.log('Cart is empty');
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        errors: [{
          type: 'empty_cart',
          message: "Your cart is empty"
        }]
      });
    }

    const validationErrors = [];
    for (const item of cart.products) {
      const product = await Product.findById(item.productId).lean();
      console.log(`Checking product ${item.productId}`);

      if (!product) {
        validationErrors.push({
          productId: item.productId,
          type: 'unavailable',
          message: `This product is no longer available.`
        });
        continue;
      }

      if (product.isBlocked) {
        validationErrors.push({
          productId: product._id,
          type: 'unavailable',
          productName: product.productName,
          message: `"${product.productName}" is not currently available.`
        });
        continue;
      }

      // Check if product is completely out of stock
      if (product.quantity <= 0) {
        validationErrors.push({
          productId: product._id,
          type: 'out_of_stock',
          productName: product.productName,
          message: `"${product.productName}" is out of stock.`
        });
      }
      // Check if requested quantity exceeds available stock
      else if (product.quantity < item.quantity) {
        validationErrors.push({
          productId: product._id,
          type: 'quantity',
          productName: product.productName,
          available: product.quantity,
          requested: item.quantity,
          message: `Only ${product.quantity} of "${product.productName}" left. You requested ${item.quantity}.`
        });
      }
    }

    if (validationErrors.length > 0) {
      console.log('Cart validation failed:', validationErrors);
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Cart validation failed",
        errors: validationErrors,
      });
    }

    console.log('Cart validated successfully');
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Cart is valid",
      redirectUrl: "/checkout",
    });
  } catch (error) {
    console.error("Cart validation error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error validating cart",
    });
  }
};