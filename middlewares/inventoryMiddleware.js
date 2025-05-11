const Product = require('../models/productSchema');
const Cart = require('../models/cartSchema');
const StatusCodes = require('../utils/httpStatusCodes');

/**
 * Middleware to validate inventory before checkout
 * This ensures that products are in stock and quantities are valid
 */
const validateInventory = async (req, res, next) => {
  try {
    const userId = req.session?.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !cart.products || cart.products.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Your cart is empty",
        errors: [{
          type: 'empty_cart',
          message: "Your cart is empty"
        }]
      });
    }

    const inventoryIssues = [];

    // Check each product in the cart
    for (const item of cart.products) {
      const product = await Product.findById(item.productId);

      if (!product) {
        inventoryIssues.push({
          productId: item.productId,
          type: 'unavailable',
          message: "This product is no longer available"
        });
        continue;
      }

      if (product.isBlocked) {
        inventoryIssues.push({
          productId: product._id,
          type: 'blocked',
          productName: product.productName,
          message: `"${product.productName}" is not available for purchase`
        });
        continue;
      }

      // We no longer check status, only quantity

      if (product.quantity <= 0) {
        inventoryIssues.push({
          productId: product._id,
          type: 'out_of_stock',
          productName: product.productName,
          message: `"${product.productName}" is out of stock`
        });
        continue;
      }

      if (product.quantity < item.quantity) {
        inventoryIssues.push({
          productId: product._id,
          type: 'quantity',
          productName: product.productName,
          available: product.quantity,
          requested: item.quantity,
          message: `Only ${product.quantity} of "${product.productName}" left. You requested ${item.quantity}.`
        });
      }
    }

    if (inventoryIssues.length > 0) {
      console.warn('Inventory validation failed during checkout', { userId, issues: inventoryIssues });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Some items in your cart are unavailable or out of stock",
        errors: inventoryIssues,
      });
    }

    // If all validations pass, proceed to next middleware
    next();
  } catch (error) {
    console.error('Error in inventory validation middleware', { error: error.message, stack: error.stack });
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error validating inventory",
    });
  }
};

module.exports = {
  validateInventory
};
