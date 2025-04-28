const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const StatusCodes = require("../../utils/httpStatusCodes");

exports.placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    
    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Get user's cart
    const cart = await Cart.findOne({ userId }).populate('products.productId');
    if (!cart || cart.products.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Get user's default address
    const user = await User.findById(userId);
    const defaultAddress = user.address.find(addr => addr.isDefault);
    
    if (!defaultAddress) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'No default address found'
      });
    }

    // Prepare ordered items
    const orderedItems = cart.products.map(item => ({
      product: item.productId._id,
      quantity: item.quantity,
      price: item.price,
      status: 'Processing'
    }));

    // Calculate totals
    const subtotal = cart.products.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCharge = 5.99; // Your shipping charge
    const tax = subtotal * 0.09; // Example tax
    const totalAmount = subtotal + shippingCharge + tax;

    // Create new order
    const newOrder = new Order({
      userId,
      orderedItems,
      totalPrice: subtotal,
      shippingCharge,
      discount: 0, // You can add coupon logic here
      finalAmount: totalAmount,
      shippingAddress: {
        fullName: defaultAddress.fullName,
        addressType: 'Home', // You can make this dynamic
        landmark: defaultAddress.landmark || '',
        city: defaultAddress.city,
        state: defaultAddress.state,
        pincode: defaultAddress.pinCode,
        phone: defaultAddress.mobile
      },
      paymentMethod: 'cod',
      paymentStatus: 'Pending',
      orderDate: new Date(),
      deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    });

    // Save the order
    const savedOrder = await newOrder.save();

    // Add order to user's order history
    user.orderHistory.push(savedOrder._id);
    await user.save();

    // Clear the cart
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { products: [] } }
    );

    return res.json({
      success: true,
      message: 'Order placed successfully',
      orderId: savedOrder._id
    });

  } catch (error) {
    console.error('Error placing order:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to place order'
    });
  }
};