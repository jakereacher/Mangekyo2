const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const StatusCodes = require("../../utils/httpStatusCodes");

exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const userId = req.session?.user; // Adjusted to match the session structure

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not logged in",
      });
    }

    const product = await Product.findById(productId);
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

    if (product.quantity < quantity) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Not enough stock available",
      });
    }

    let cart = await Cart.findOne({ userId });
    const price = product.salePrice;
    const totalPrice = price * quantity;

    if (!cart) {
      cart = new Cart({
        userId,
        products: [{ productId, quantity, price, totalPrice }],
      });

      await cart.save();

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
        return res.status(StatusCodes.UNAUTHORIZED).json({
          success: false,
          message: "Not authenticated",
        });
      }
  
      const cart = await Cart.findOne({ userId }).lean();
  
      if (!cart || !cart.products || cart.products.length === 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Your cart is empty",
        });
      }
  
      const validationErrors = [];
  
      for (const item of cart.products) {
        const product = await Product.findById(item.productId).lean();
  
        if (!product) {
          validationErrors.push({
            productId: item.productId,
            message: `This product is no longer available.`,
          });
          continue;
        }
  
        if (product.isDeleted || product.status !== "Available") {
          validationErrors.push({
            productId: product._id,
            message: `"${product.productName}" is not currently available.`,
          });
          continue;
        }
  
        if (product.quantity < item.quantity) {
          validationErrors.push({
            productId: product._id,
            message: `Only ${product.quantity} "${product.productName}" left in stock. You have ${item.quantity} in cart.`,
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
  