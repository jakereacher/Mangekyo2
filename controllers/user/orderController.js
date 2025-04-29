const mongoose = require("mongoose");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Wallet = require("../../models/walletSchema");
const Log = require("../../models/logSchema");
const StatusCodes = require("../../utils/httpStatusCodes");

// Place a new order
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

    // 1. Validate the cart
    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !cart.products || cart.products.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Your cart is empty",
        redirect: "/cart",
      });
    }

    // 2. Validate user and address
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

    // 3. Prepare ordered items with product validation
    const orderedItems = await Promise.all(
      cart.products.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product || product.isBlocked || product.status !== "Available") {
          return null;
        }

        // Check stock availability
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

    // 4. Calculate order totals
    const subtotal = validItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const shipping = 5.99;
    const tax = subtotal * 0.09;
    const total = subtotal + shipping + tax;

    // 5. Check wallet balance if paying with wallet
    if (paymentMethod === "wallet") {
      let wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        wallet = new Wallet({ user: userId, balance: 0, transactions: [] });
        await wallet.save();
      }
      if (wallet.balance < total) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Insufficient wallet balance",
        });
      }
    }

    // 6. Create the order document
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

    // 7. Save the order
    const newOrder = await order.save();

    // 8. Update product quantities
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
      // Rollback: Delete the order
      await Order.deleteOne({ _id: newOrder._id });
      throw new Error("Failed to update product quantities: " + error.message);
    }

    // 9. Update user (order history and wallet)
    try {
      const updateUser = {
        $push: { orderHistory: newOrder._id },
      };

      if (paymentMethod === "wallet") {
        const wallet = await Wallet.findOne({ user: userId });
        wallet.balance -= total;
        wallet.transactions.push({
          type: "debit",
          amount: total,
          description: `Payment for order #${newOrder._id}`,
          date: new Date(),
        });
        await wallet.save();
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

    // 10. Clear the cart
    try {
      await Cart.deleteOne({ userId });
    } catch (error) {
      console.error("Failed to clear cart:", error);
      // Log but continue, as cart clearing is non-critical
    }

    // 11. Return success response
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

// Get order details
exports.getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;

    // Validate ObjectId to prevent CastError
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(StatusCodes.BAD_REQUEST).render("page-404", {
        message: "Invalid order ID",
      });
    }

    if (!userId) {
      return res.redirect("/login");
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate("orderedItems.product")
      .lean();

    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).render("page-404");
    }

    // Calculate overall order status
    const status = calculateOverallStatus(order.orderedItems);

    // Format order data for the template
    const orderDetails = {
      ...order,
      status,
      formattedOrderDate: new Date(order.orderDate).toLocaleDateString(),
      formattedDeliveryDate: new Date(order.deliveryDate).toLocaleDateString(),
      items: order.orderedItems.map((item) => ({
        ...item,
        product: {
          ...item.product,
          mainImage:
            item.product.productImage && item.product.productImage.length > 0
              ? item.product.productImage[0]
              : "/images/default-product.jpg",
        },
        totalPrice: (item.quantity * item.price).toFixed(2),
      })),
      subtotal: order.totalPrice.toFixed(2),
      shipping: order.shippingCharge.toFixed(2),
      tax: order.taxAmount ? order.taxAmount.toFixed(2) : (order.totalPrice * 0.09).toFixed(2),
      total: order.finalAmount.toFixed(2),
    };

    res.render("order-details", {
      order: orderDetails,
      user: req.session.user ? { id: userId } : null,
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("page-404");
  }
};

// Get all orders for a user
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const orders = await Order.find({ userId })
      .sort({ orderDate: -1 }) // Newest first
      .populate("orderedItems.product")
      .lean();

    // Format orders with overall status
    const formattedOrders = orders.map((order) => ({
      ...order,
      status: calculateOverallStatus(order.orderedItems),
    }));

    res.status(StatusCodes.OK).json({
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
};

// Cancel an order
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;

    // Validate ObjectId
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order can be cancelled
    const canCancel = order.orderedItems.every(
      (item) => item.status === "Processing"
    );

    if (!canCancel) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Order cannot be cancelled at this stage",
      });
    }

    // Update order status
    order.orderedItems.forEach((item) => {
      item.status = "Cancelled";
      item.order_cancelled_date = new Date();
    });
    order.cancellationReason = "User requested cancellation";

    // Restore product quantities
    try {
      await Promise.all(
        order.orderedItems.map(async (item) => {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { quantity: item.quantity },
          });
          // Log status change
          await Log.create({
            orderId,
            productId: item.product,
            status: "Cancelled",
          });
        })
      );
    } catch (error) {
      console.error("Failed to restore product quantities or log status:", error);
      // Log for manual intervention
    }

    // Refund wallet if payment was made with wallet
    if (order.paymentMethod === "wallet") {
      try {
        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
          wallet = new Wallet({ user: userId, balance: 0, transactions: [] });
        }
        wallet.balance += order.finalAmount;
        wallet.transactions.push({
          type: "credit",
          amount: order.finalAmount,
          description: `Refund for cancelled order #${orderId}`,
          date: new Date(),
        });
        await wallet.save();
      } catch (error) {
        console.error("Failed to refund wallet:", error);
        // Log for manual intervention
      }
    }

    const updatedOrder = await order.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Order cancelled successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to cancel order",
    });
  }
};

// Request a return for an order item
exports.requestReturn = async (req, res) => {
  try {
    const { orderId, productId, returnReason } = req.body;
    const userId = req.session.user;

    // Validate ObjectIds
    if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(productId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid order or product ID",
      });
    }

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Find the order
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Order not found",
      });
    }

    // Find the order item
    const item = order.orderedItems.find(
      (item) => item.product.toString() === productId
    );
    if (!item) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Item not found in order",
      });
    }

    // Check if return is possible (e.g., within 7 days of delivery)
    const deliveryDate = item.order_delivered_date;
    const returnWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    if (!deliveryDate || Date.now() - new Date(deliveryDate) > returnWindow) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Return period has expired",
      });
    }
    if (item.status !== "Delivered") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Item is not eligible for return",
      });
    }

    // Update item status and return details
    item.status = "Return Request";
    item.returnReason = returnReason;
    item.order_return_request_date = new Date();
    item.order_return_status = "Pending";

    // Log the status change
    await Log.create({
      orderId,
      productId,
      status: "Return Request",
    });

    await order.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Return request submitted successfully",
    });
  } catch (error) {
    console.error("Error requesting return:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to submit return request",
    });
  }
};

// Helper function to calculate overall order status
function calculateOverallStatus(orderedItems) {
  if (!orderedItems || orderedItems.length === 0) return "Processing";

  if (orderedItems.every((item) => item.status === "Delivered")) {
    return "Delivered";
  }
  if (orderedItems.some((item) => item.status === "Shipped")) {
    return "Shipped";
  }
  if (orderedItems.some((item) => item.status === "Cancelled")) {
    return "Cancelled";
  }
  if (orderedItems.some((item) => item.status === "Return Request")) {
    return "Return Requested";
  }
  if (orderedItems.some((item) => item.status === "Returned")) {
    return "Returned";
  }
  return "Processing";
}