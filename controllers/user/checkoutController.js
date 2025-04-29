const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const mongoose = require("mongoose");

exports.renderCheckoutPage= async (req, res) => {
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
    const { paymentMethod, addressId } = req.body;

    // Validate user session
    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Validate payment method
    if (!["cod", "wallet"].includes(paymentMethod)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // Validate cart
    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !cart.products || cart.products.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Your cart is empty",
        redirect: "/cart",
      });
    }

    // Validate user and address
    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found",
      });
    }

    const selectedAddress = user.address.id(addressId);
    if (!selectedAddress) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Selected address not found",
      });
    }

    // Validate products and stock
    const orderedItems = await Promise.all(
      cart.products.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product || product.isBlocked || product.status !== "Available") {
          return null;
        }

        if (product.quantity < item.quantity) {
          return {
            product: item.productId,
            quantity: product.quantity,
            price: item.price,
            status: "Processing",
            stockIssue: true,
          };
        }

        return {
          product: item.productId,
          quantity: item.quantity,
          price: item.price,
          status: "Processing",
        };
      })
    );

    // Filter out invalid products and check for stock issues
    const validItems = orderedItems.filter((item) => item !== null);
    const stockIssues = validItems.filter((item) => item.stockIssue);

    if (validItems.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "No valid products in your cart",
        redirect: "/cart",
      });
    }

    if (stockIssues.length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Some items have insufficient stock",
        items: stockIssues,
        redirect: "/cart",
      });
    }

    // Calculate order totals
    const subtotal = validItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const shipping = 5.99;
    const tax = subtotal * 0.09;
    const total = subtotal + shipping + tax;

    // Check wallet balance for wallet payments
    if (paymentMethod === "wallet" && user.wallet < total) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    // Create the order document
    const order = new Order({
      userId,
      orderedItems: validItems,
      totalPrice: subtotal,
      shippingCharge: shipping,
      taxAmount: tax,
      discount: 0,
      finalAmount: total,
      shippingAddress: {
        fullName: selectedAddress.fullName,
        addressType: selectedAddress.addressType || "Home",
        landmark: selectedAddress.landmark || "",
        city: selectedAddress.city,
        state: selectedAddress.state,
        pincode: selectedAddress.pinCode,
        phone: selectedAddress.mobile,
      },
      paymentMethod,
      paymentStatus: paymentMethod === "cod" ? "Pending" : "Paid",
      orderDate: new Date(),
      deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Save the order
    const newOrder = await order.save();

    // Update product quantities
    try {
      await Promise.all(
        validItems.map(async (item) => {
          const product = await Product.findById(item.product);
          if (product.quantity >= item.quantity) {
            product.quantity -= item.quantity;
            await product.save();
          } else {
            throw new Error(`Insufficient stock for product ${item.product}`);
          }
        })
      );
    } catch (error) {
      // Rollback: Delete the order if product update fails
      await Order.deleteOne({ _id: newOrder._id });
      throw new Error("Failed to update product quantities: " + error.message);
    }

    // Update user (order history and wallet)
    try {
      const updateUser = {
        $push: { orderHistory: newOrder._id },
      };

      if (paymentMethod === "wallet") {
        updateUser.$inc = { wallet: -total };
      }

      await User.findByIdAndUpdate(userId, updateUser);
    } catch (error) {
      // Rollback: Delete order and restore product quantities
      await Order.deleteOne({ _id: newOrder._id });
      await Promise.all(
        validItems.map(async (item) => {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { quantity: item.quantity },
          });
        })
      );
      throw new Error("Failed to update user: " + error.message);
    }

    // Clear the cart
    try {
      await Cart.deleteOne({ userId });
    } catch (error) {
      // Partial rollback: Order is saved, but cart clearing failed
      console.error("Failed to clear cart:", error);
      // Notify admin or log for manual intervention
    }

    // Return success response
    res.status(StatusCodes.OK).json({
      success: true,
      message: "Order placed successfully",
      orderId: newOrder._id,
    });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to place order",
      error: error.message,
    });
  }
};

// exports.placeOrder = async (req, res) => {
//   try {
//     const userId = req.session.user;

//     if (!userId) {
//       return res.status(StatusCodes.UNAUTHORIZED).json({
//         success: false,
//         message: 'User not authenticated'
//       });
//     }

//     // Validate cart
//     const cart = await Cart.findOne({ userId });
//     if (!cart || !cart.products || cart.products.length === 0) {
//       return res.status(StatusCodes.BAD_REQUEST).json({
//         success: false,
//         message: 'Your cart is empty'
//       });
//     }

//     // Validate user and address
//     const user = await User.findById(userId);
//     const defaultAddress = user.address.find(addr => addr.isDefault);
//     if (!defaultAddress) {
//       return res.status(StatusCodes.BAD_REQUEST).json({
//         success: false,
//         message: 'No default address selected'
//       });
//     }

//     // Get selected payment method
//     const paymentMethod = req.body.paymentMethod || 'cod';

//     // Calculate totals
//     const cartItems = await Promise.all(
//       cart.products.map(async (item) => {
//         const product = await Product.findById(item.productId);
//         if (!product) return null;

//         return {
//           product: item.productId,
//           quantity: item.quantity,
//           price: item.price,
//           status: 'Processing'
//         };
//       })
//     );

//     const validCartItems = cartItems.filter(item => item !== null);
//     const subtotal = validCartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
//     const shipping = 5.99; // Fixed shipping
//     const tax = subtotal * 0.09; // Example 9% tax
//     const total = subtotal + shipping + tax;

//     // Create order
//     const order = new Order({
//       userId,
//       orderedItems: validCartItems,
//       totalPrice: subtotal,
//       shippingCharge: shipping,
//       discount: 0, // You can add coupon logic here
//       finalAmount: total,
//       shippingAddress: {
//         fullName: defaultAddress.fullName,
//         addressType: 'Home', // You can make this dynamic
//         landmark: defaultAddress.landmark || '',
//         city: defaultAddress.city,
//         state: defaultAddress.state,
//         pincode: defaultAddress.pinCode,
//         phone: defaultAddress.mobile
//       },
//       paymentMethod,
//       paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
//       orderDate: new Date(),
//       deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
//     });

//     // Save order
//     const newOrder = await order.save();

//     // Add order to user's order history
//     user.orderHistory.push(newOrder._id);
//     await user.save();

//     // Clear cart
//     await Cart.deleteOne({ userId });

//     res.json({
//       success: true,
//       message: 'Order placed successfully',
//       orderId: newOrder._id
//     });

//   } catch (error) {
//     console.error('Error placing order:', error);
//     res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
//       success: false,
//       message: 'Error placing order'
//     });
//   }
// };

