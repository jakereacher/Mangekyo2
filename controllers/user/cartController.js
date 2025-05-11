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

    // Calculate price based on offer if available
    let price = product.price || 0;

    // Apply discount if product has an offer
    if (product.productOffer && product.offer) {
      // Handle different discount types
      if (product.offer.discountType === 'percentage') {
        const discountAmount = (price * product.offer.discountValue) / 100;
        price = price - discountAmount;
      } else if (product.offer.discountType === 'fixed') {
        price = price - product.offer.discountValue;
        if (price < 0) price = 0;
      }
    } else if (product.productOffer && product.offerPercentage > 0) {
      // Fallback to offerPercentage if offer object is not available
      const discountAmount = (price * product.offerPercentage) / 100;
      price = price - discountAmount;
    }

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

exports.renderCartPage = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    const cart = await Cart.findOne({ userId });
    const allProducts = await Product.find({ isDeleted: false });
    let cartProducts = [];

    if (cart && cart.products && cart.products.length > 0) {
      const sortedCartProducts = cart.products.sort(
        (a, b) => new Date(b.added_at) - new Date(a.added_at)
      );

      cartProducts = await Promise.all(
        sortedCartProducts.map(async (item) => {
          const productDetails = await Product.findById(item.productId);
          if (!productDetails) return null;

          return {
            product: productDetails,
            quantity: item.quantity,
            added_at: item.added_at,
            price: item.price,
            totalPrice: item.totalPrice,
          };
        })
      );

      cartProducts = cartProducts.filter((item) => item !== null);
    }

    const cartCount = cart ? cart.products.length : 0;

    return res.render("cart", {
      name: "", // Can't access user name if session only stores userId
      userId,
      cartProducts,
      products: allProducts,
      cartCount,
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

      if (product.isBlocked || product.status !== "Available") {
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