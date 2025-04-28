const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const StatusCodes = require("../../utils/httpStatusCodes");

exports.renderCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    // Get user with addresses
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).render('page-404');
    }

    // Get validated cart items
    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !cart.products || cart.products.length === 0) {
      req.flash('error', 'Your cart is empty');
      return res.redirect('/cart');
    }

    // Populate product details with proper image handling
    const cartItems = await Promise.all(
      cart.products.map(async (item) => {
        const product = await Product.findById(item.productId).lean();
        if (!product) return null;

        // Handle product images safely
        const mainImage = product.productImage && product.productImage.length > 0 
          ? product.productImage[0] 
          : '/images/default-product.jpg';

        return {
          ...item,
          product: {
            ...product,
            mainImage // Add the processed image to the product object
          }
        };
      })
    );

    // Filter out invalid products
    const validCartItems = cartItems.filter(item => item !== null);

    // Calculate totals
    const subtotal = validCartItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const shipping = 5.99; // Fixed shipping for now
    const tax = subtotal * 0.09; // Example 9% tax
    const total = subtotal + shipping + tax;

    // Get the addresses starting from index 1, ensuring the first valid address is set as default
    let defaultAddress = null;
    if (Array.isArray(user.address) && user.address.length > 0) {
      // Start searching from index 1, and set the first valid address as default
      defaultAddress = user.address.find((addr, idx) => addr && idx > 0 && addr.isDefault) || user.address[1];
    }

    res.render("checkout", {
      user,
      cartItems: validCartItems,
      cartCount: validCartItems.length,
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      addresses: user.address ? user.address.filter(addr => addr !== null) : [], // Filter out null addresses
      defaultAddress,
      currentStep: 1
    });

  } catch (error) {
    console.error('Error rendering checkout page:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('page-404');
  }
};

exports.handleAddressSelection = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.body;

    if (!userId || !addressId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid request'
      });
    }

    // Set all addresses' isDefault to false
    await User.updateMany(
      { _id: userId },
      { $set: { 'address.$[].isDefault': false } }
    );

    // Set selected address's isDefault to true
    await User.updateOne(
      { _id: userId, 'address.id': addressId },
      { $set: { 'address.$.isDefault': true } }
    );

    res.json({
      success: true,
      message: 'Default address updated'
    });

  } catch (error) {
    console.error('Error updating default address:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Validate cart
    const cart = await Cart.findOne({ userId });
    if (!cart || !cart.products || cart.products.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    // Validate user and address
    const user = await User.findById(userId);
    const defaultAddress = user.address.find(addr => addr.isDefault);
    if (!defaultAddress) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'No default address selected'
      });
    }

    // Calculate totals
    const cartItems = await Promise.all(
      cart.products.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product) return null;

        return {
          ...item,
          product
        };
      })
    );

    const validCartItems = cartItems.filter(item => item !== null);
    const subtotal = validCartItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const shipping = 5.99; // Fixed shipping
    const tax = subtotal * 0.09; // Example 9% tax
    const total = subtotal + shipping + tax;

    // Create order
    const order = {
      userId,
      address: defaultAddress,
      products: validCartItems,
      paymentMethod: 'cod', // Default to COD for now
      subtotal,
      shipping,
      tax,
      total,
      status: 'Pending',
      createdAt: new Date()
    };

    // Save order (assuming an Order model exists)
    const newOrder = await Order.create(order);

    // Clear cart
    await Cart.deleteOne({ userId });

    res.json({
      success: true,
      message: 'Order placed successfully',
      orderId: newOrder._id
    });

  } catch (error) {
    console.error('Error placing order:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error placing order'
    });
  }
};