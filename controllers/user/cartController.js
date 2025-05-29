/**
 * CartController
 */

const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const wishlistController = require('./wishlistController');

//=================================================================================================
// Add To Cart
//=================================================================================================
// This function adds a product to the cart.
// It adds a product to the cart.
//=================================================================================================

exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    if (!req.session || !req.session.user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not logged in",
      });
    }

    const userId = req.session.user._id || req.session.user;
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

    if (product.quantity <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "This product is currently out of stock",
        outOfStock: true
      });
    }

    if (product.quantity < quantity) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `Only ${product.quantity} items available in stock. You requested ${quantity}.`,
        availableStock: product.quantity,
        requestedQuantity: quantity
      });
    }

    let cart = await Cart.findOne({ userId });

    const offerService = require('../../services/offerService');
    const basePrice = product.price || 0;

    const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);

    let price = offerResult.finalPrice;

    if (price < 0) price = 0;

    const totalPrice = price * quantity;

    if (!cart) {
      cart = new Cart({
        userId,
        products: [{ productId, quantity, price, totalPrice }],
      });

      await cart.save();

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

//=================================================================================================
// Refresh Cart Prices
//=================================================================================================
// This function refreshes the cart prices.
// It refreshes the cart prices.
//=================================================================================================
const refreshCartPrices = async (userId) => {
  try {
    const cart = await Cart.findOne({ userId });
    if (!cart || !cart.products || cart.products.length === 0) {
      return { updated: false, cart: null };
    }

    const offerService = require('../../services/offerService');
    let pricesUpdated = false;

    for (const item of cart.products) {
      const product = await Product.findById(item.productId);
      if (!product) continue;

      const basePrice = product.price || 0;
      const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);
      const currentBestPrice = offerResult.finalPrice;

      const priceDifference = Math.abs(item.price - currentBestPrice);
      const shouldUpdatePrice = priceDifference > 0.01; // 1 cent threshold

      if (shouldUpdatePrice) {
        item.price = currentBestPrice;
        item.totalPrice = currentBestPrice * item.quantity;
        pricesUpdated = true;
      }
    }

    if (pricesUpdated) {
      await cart.save();
    }

    return { updated: pricesUpdated, cart };
  } catch (error) {
    console.error('Error refreshing cart prices:', error);
    return { updated: false, error };
  }
};

//=================================================================================================
// Render Cart Page
//=================================================================================================
// This function renders the cart page.
// It renders the cart page.
//=================================================================================================
exports.renderCartPage = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    const { updated, cart, error } = await refreshCartPrices(userId);

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

//=================================================================================================
// Remove From Cart
//=================================================================================================
// This function removes a product from the cart.
// It removes a product from the cart.
//=================================================================================================
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

//=================================================================================================
// Refresh Cart Prices
//=================================================================================================
// This function refreshes the cart prices.
// It refreshes the cart prices.
//=================================================================================================
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
//=================================================================================================
// Validate Cart
//=================================================================================================
// This function validates the cart.
// It validates the cart.
//=================================================================================================
exports.validateCart = async (req, res) => {
  try {
    const userId = req.session?.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Not authenticated",
      });
    }

    await refreshCartPrices(userId);
    const cart = await Cart.findOne({ userId }).lean();

    if (!cart || !cart.products || cart.products.length === 0) {
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

      if (product.quantity <= 0) {
        validationErrors.push({
          productId: product._id,
          type: 'out_of_stock',
          productName: product.productName,
          message: `"${product.productName}" is out of stock.`
        });
      }

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
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Cart validation failed",
        errors: validationErrors,
      });
    }
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
