const mongoose = require("mongoose");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Wallet = require("../../models/walletSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const winston = require("winston");

// Configure Winston logger
const logger = winston.createLogger({
  level: "error",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.File({ filename: "error.log" }), new winston.transports.Console()],
});

// Helper function to calculate overall order status
function calculateOverallStatus(orderedItems) {
  if (!orderedItems || orderedItems.length === 0) return "Processing";

  if (orderedItems.every((item) => item.status === "Delivered")) {
    return "Delivered";
  }
  if (orderedItems.some((item) => item.status === "Shipped")) {
    return "Shipped";
  }
  if (orderedItems.every((item) => item.status === "Cancelled")) {
    return "Cancelled";
  }
  if (orderedItems.some((item) => item.status === "Cancelled")) {
    return "Partially Cancelled";
  }
  if (orderedItems.some((item) => item.status === "Cancellation Pending")) {
    return "Cancellation Pending";
  }
  if (orderedItems.some((item) => item.status === "Return Request")) {
    return "Return Requested";
  }
  if (orderedItems.some((item) => item.status === "Returned")) {
    return "Returned";
  }
  return "Processing";
}

// Get all orders for admin
exports.getAllOrders = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      logger.error("Unauthorized access to /admin/orders", { adminId: null });
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    const page = Number.parseInt(req.query.page) || 1;
    const limit = Number.parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find()
      .populate("userId", "email fullName")
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalOrders = await Order.countDocuments();

    const formattedOrders = orders.map((order) => ({
      ...order,
      status: calculateOverallStatus(order.orderedItems),
      customerName: order.userId.fullName,
      customerEmail: order.userId.email,
      formattedOrderDate: new Date(order.orderDate).toLocaleDateString(),
      finalAmount: order.finalAmount || order.totalPrice + order.shippingCharge + (order.taxAmount || 0),
      // Display order number if available, otherwise use the first 8 characters of the ID
      displayOrderId: order.orderNumber || order._id.toString().substring(0, 8)
    }));

    res.render("admin-orders", {
      orders: formattedOrders,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
      },
      limit,
      admin: { id: adminId },
      csrfToken: req.csrfToken ? req.csrfToken() : "",
      activePage: "orders",
    });
  } catch (error) {
    logger.error("Error fetching all orders", { error: error.message, stack: error.stack });
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/error", {
      message: "Failed to load orders",
      activePage: "orders",
    });
  }
};

// Get admin order details
exports.getAdminOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const adminId = req.session.admin;
    if (!adminId) {
      logger.error("Unauthorized access to /admin/orders/:orderId", { orderId, adminId: null });
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      logger.error("Invalid orderId format", { orderId });
      return res.status(StatusCodes.BAD_REQUEST).render("admin/error", {
        message: "Invalid order ID",
        activePage: "orders",
      });
    }

    const order = await Order.findById(orderId)
      .populate("orderedItems.product")
      .populate("userId", "email fullName")
      .lean();

    if (!order) {
      logger.error("Order not found", { orderId });
      return res.status(StatusCodes.NOT_FOUND).render("admin/error", {
        message: "Order not found",
        activePage: "orders",
      });
    }

    // Calculate overall status
    const status = calculateOverallStatus(order.orderedItems);

    // Check if all items are cancelled
    const allItemsCancelled = order.orderedItems.every(item => item.status === "Cancelled");

    // Get non-cancelled items
    const nonCancelledItems = order.orderedItems.filter(item => item.status !== "Cancelled");

    // Calculate subtotal for non-cancelled items
    const subtotal = nonCancelledItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Add shipping and tax
    const shipping = order.shippingCharge || 0;
    const tax = order.taxAmount || (subtotal * 0.09); // Default tax rate if not specified

    // Calculate final amount
    let finalAmount = subtotal + shipping + tax;

    // Apply discount if applicable
    if (order.discount && order.discount > 0) {
      finalAmount -= order.discount;
    }

    // Ensure amount is not negative
    finalAmount = Math.max(0, finalAmount);

    // If all items are cancelled, update the payment status display
    let displayPaymentStatus = order.paymentStatus;
    if (allItemsCancelled && (order.paymentStatus === 'Pending' || order.paymentStatus === 'Failed')) {
      displayPaymentStatus = 'Cancelled';
    }

    const orderDetails = {
      ...order,
      status: allItemsCancelled ? "Cancelled" : status,
      formattedOrderDate: new Date(order.orderDate).toLocaleDateString(),
      formattedDeliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : "Pending",
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
      subtotal: subtotal.toFixed(2),
      discount: order.discount || 0,
      couponCode: order.couponCode,
      shipping: shipping.toFixed(2),
      tax: tax.toFixed(2),
      total: finalAmount.toFixed(2),
      userEmail: order.userId.email,
      userName: order.userId.fullName,
      paymentStatus: displayPaymentStatus,
      allItemsCancelled: allItemsCancelled,
      // Display order number if available, otherwise use the ID
      displayOrderId: order.orderNumber || order._id.toString()
    };

    res.render("admin-order-details", {
      order: orderDetails,
      admin: { id: adminId },
      csrfToken: req.csrfToken ? req.csrfToken() : "",
      activePage: "orders",
    });
  } catch (error) {
    logger.error("Error fetching admin order details", {
      orderId: req.params.orderId,
      error: error.message,
      stack: error.stack,
    });
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/error", {
      message: "Failed to load order details",
      activePage: "orders",
    });
  }
};

// Update order item status (admin)
exports.updateOrderItemStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, status } = req.body;
    const adminId = req.session.admin;

    console.log("Admin update order status request:", { orderId, productId, status, adminId });

    if (!adminId) {
      logger.error("Unauthorized attempt to update item status", { orderId, productId, adminId: null });
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Admin not authenticated",
      });
    }

    // Validate ObjectId for orderId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      logger.error("Invalid orderId format", { orderId });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    // Validate ObjectId for productId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      logger.error("Invalid productId format", { productId });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const validStatuses = ["Processing", "Shipped", "Delivered", "Cancelled"];
    if (!validStatuses.includes(status)) {
      logger.error("Invalid status provided", { orderId, productId, status });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid status",
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      logger.error("Order not found for status update", { orderId });
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Order not found",
      });
    }

    const item = order.orderedItems.find((item) => item.product.toString() === productId);
    if (!item) {
      logger.error("Item not found in order", { orderId, productId });
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Item not found in order",
      });
    }

    // Handle product quantity updates
    try {
      const product = await Product.findById(productId);

      // If changing to Cancelled and not already cancelled, restore quantity and process refund automatically
      if (status === "Cancelled" && item.status !== "Cancelled") {
        const updatedProduct = await Product.findByIdAndUpdate(
          productId,
          { $inc: { quantity: item.quantity } },
          { new: true }
        );

        // Update status based on new quantity
        if (updatedProduct.quantity > 0 && updatedProduct.status !== "Available") {
          updatedProduct.status = "Available";
          await updatedProduct.save();
        }
        logger.info("Restored product quantity", { productId, quantity: item.quantity });

        // Process refund automatically for all payment methods
        if (order.paymentStatus === "Paid" || order.paymentMethod === "razorpay" || order.paymentMethod === "wallet") {
          const refundAmount = item.price * item.quantity;
          let wallet = await Wallet.findOne({ user: order.userId });
          if (!wallet) {
            wallet = new Wallet({ user: order.userId, balance: 0 });
          }

          wallet.balance += refundAmount;
          await wallet.save();

          // Create a wallet transaction record
          const transaction = new WalletTransaction({
            user: order.userId,
            amount: refundAmount,
            type: "credit",
            description: `Refund for cancelled item in order #${order.orderNumber || orderId.substring(0, 8)}`,
            status: "completed",
            orderId: orderId
          });
          await transaction.save();

          logger.info("Added refund to user wallet", { userId: order.userId, amount: refundAmount });
        }

        // Mark as cancelled by admin
        order.cancelledBy = "admin";
        order.cancelledAt = new Date();

        // Recalculate order totals
        // Get all non-cancelled items (excluding the current item being cancelled)
        const nonCancelledItems = order.orderedItems.filter(i =>
          i.status !== "Cancelled" && i._id.toString() !== item._id.toString()
        );

        // Calculate new subtotal
        const newSubtotal = nonCancelledItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

        // Update order totals
        order.totalPrice = newSubtotal;

        // Recalculate tax (assuming 9% tax rate)
        const newTax = newSubtotal * 0.09;
        order.taxAmount = newTax;

        // Calculate new final amount (subtotal + shipping + tax - discount)
        const newFinalAmount = newSubtotal + (order.shippingCharge || 0) + newTax - (order.discount || 0);
        order.finalAmount = Math.max(0, newFinalAmount); // Ensure it's not negative

        // Check if all items are now cancelled
        const allItemsCancelled = order.orderedItems.every(i =>
          i.status === "Cancelled" || i._id.toString() === item._id.toString()
        );

        // If all items are cancelled, update the order status
        if (allItemsCancelled) {
          console.log('All items in order are now cancelled');
          order.orderStatus = "Cancelled";

          // If payment is pending or failed, mark it as cancelled
          if (order.paymentStatus === 'Pending' || order.paymentStatus === 'Failed') {
            order.paymentStatus = 'Cancelled';
          }
        }
      }

      // If changing from Cancelled to another status, reduce quantity
      if (item.status === "Cancelled" && status !== "Cancelled") {
        if (product.quantity < item.quantity) {
          logger.error("Insufficient stock for status update", {
            productId,
            available: product.quantity,
            required: item.quantity,
          });
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: `Insufficient stock to ship item ${product.productName}. Available: ${product.quantity}`,
          });
        }

        const updatedProduct = await Product.findByIdAndUpdate(
          productId,
          { $inc: { quantity: -item.quantity } },
          { new: true }
        );

        // Update status if quantity becomes zero
        if (updatedProduct.quantity <= 0 && updatedProduct.status !== "Out of Stock") {
          updatedProduct.status = "Out of Stock";
          await updatedProduct.save();
        }
        logger.info("Reduced product quantity", { productId, quantity: item.quantity });
      }

      // Update status-specific timestamps
      if (status === "Delivered" && item.status !== "Delivered") {
        item.order_delivered_date = new Date();
      } else if (status === "Shipped" && item.status !== "Shipped") {
        item.order_shipped_date = new Date();
      } else if (status === "Cancelled" && item.status !== "Cancelled") {
        item.order_cancelled_date = new Date();
        item.order_cancel_reason = "Cancelled by admin";
      }

      // Update the status
      const oldStatus = item.status;
      item.status = status;

      // Save the order
      await order.save();

      // Update payment status if all items are delivered for COD orders
      if (order.paymentMethod === "cod" && order.orderedItems.every((item) => item.status === "Delivered")) {
        order.paymentStatus = "Paid";
        await order.save();
        logger.info("Updated payment status to Paid", { orderId });
      }

      console.log("Order status updated successfully");
      res.status(StatusCodes.OK).json({
        success: true,
        message: "Item status updated successfully",
      });
    } catch (error) {
      logger.error("Error updating item status", {
        orderId: req.params.orderId,
        productId: req.body.productId,
        error: error.message,
        stack: error.stack,
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to update item status",
      });
    }
  } catch (error) {
    logger.error("Error updating item status", {
      orderId: req.params.orderId,
      productId: req.body.productId,
      error: error.message,
      stack: error.stack,
    });
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to update item status",
    });
  }
};

// Cancellation requests functionality has been removed as per requirements
// All cancellations are now processed automatically without requiring admin approval

// Get all return requests for admin with pagination
exports.getReturnRequests = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      logger.error("Unauthorized access to /admin/return-requests", { adminId: null });
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 2; // Default to 2 requests per page
    const skip = (page - 1) * limit;

    // Find all orders with items that have return requests
    const orders = await Order.find({
      "orderedItems.status": "Return Request",
    })
      .populate("userId", "email fullName")
      .populate("orderedItems.product")
      .sort({ orderDate: -1 })
      .lean();

    // Format the return requests for display
    let returnRequests = [];
    orders.forEach((order) => {
      order.orderedItems.forEach((item) => {
        if (item.status === "Return Request") {
          returnRequests.push({
            orderId: order._id,
            orderDate: new Date(order.orderDate).toLocaleDateString(),
            customerName: order.userId.fullName,
            customerEmail: order.userId.email,
            productId: item.product._id,
            productName: item.product.productName,
            productImage:
              item.product.productImage && item.product.productImage.length > 0
                ? `/uploads/product-images/${item.product.productImage[0]}`
                : "/images/default-product.jpg",
            quantity: item.quantity,
            price: item.price,
            returnReason: item.returnReason,
            returnRequestDate: new Date(item.order_return_request_date).toLocaleDateString(),
          });
        }
      });
    });

    // Get total count for pagination
    const totalItems = returnRequests.length;

    // Calculate pagination values
    const totalPages = Math.ceil(totalItems / limit) || 1; // Ensure at least 1 page even if no items

    // Apply pagination to the formatted requests
    returnRequests = returnRequests.slice(skip, skip + limit);

    // Build search params for pagination links
    const searchParams = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';
    const searchParamsWithoutLimit = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';

    // Log pagination info for debugging
    console.log('Return Requests Pagination:', {
      page,
      limit,
      totalItems,
      totalPages,
      returnRequestsCount: returnRequests.length
    });

    res.render("admin-return-requests", {
      returnRequests,
      admin: { id: adminId },
      csrfToken: req.csrfToken ? req.csrfToken() : "",
      activePage: "returns",
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems,
        limit: limit,
        searchParams: searchParams + (limit !== 2 ? `&limit=${limit}` : ''), // Changed default from 10 to 2
        searchParamsWithoutLimit: searchParamsWithoutLimit
      }
    });
  } catch (error) {
    logger.error("Error fetching return requests", { error: error.message, stack: error.stack });
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin-error", {
      message: "Failed to load return requests",
      activePage: "returns",
    });
  }
};

// Approve a return request
exports.approveReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId } = req.body;
    const adminId = req.session.admin;

    console.log("Admin approve return request:", { orderId, productId, adminId });

    if (!adminId) {
      logger.error("Unauthorized attempt to approve return", { orderId, productId, adminId: null });
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Admin not authenticated",
      });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      logger.error("Invalid orderId or productId format", { orderId, productId });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid order or product ID",
      });
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      logger.error("Order not found for return approval", { orderId });
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Order not found",
      });
    }

  //find the user
    // const user = await User.findById(order.userId);
    // if (!user) {
    //   logger.error("User not found for return approval", { userId: order.userId });
    //   return res.status(StatusCodes.NOT_FOUND).json({
    //     success: false,
    //     message: "User not found",
    //   });
    // }


    // // find the wallet
    // const wallet = await Wallet.findById( user._id );
    // console.log("walletCheck2",wallet)
    // if (!wallet) {
    //   wallet = await Wallet.create({
    //     _id: user._id, // Assuming you're using user._id as the wallet ID
    //     userId: user._id, // Optional, if your Wallet schema includes this
    //     balance: product.saleprice, // Or whatever default values you use
    //     // other fields...
    //   });
    //   console.log("New wallet created:", wallet);
    // }
    // Find the order item
    const item = order.orderedItems.find((item) => item.product.toString() === productId);
    if (!item) {
      logger.error("Item not found in order", { orderId, productId });
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Item not found in order",
      });
    }

    // Check if item has a pending return request
    if (item.status !== "Return Request" || item.order_return_status !== "Pending") {
      logger.error("Item does not have a pending return request", { orderId, productId, status: item.status });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Item does not have a pending return request",
      });
    }

    // Update item status
    item.status = "Returned";
    item.order_return_status = "Approved";
    item.order_returned_date = new Date();
    refundAmount = item.price * item.quantity; // Calculate refund amount
    // Add the refund amount to the user's wallet
    try {
      // Find or create user wallet
      let wallet = await Wallet.findOne({ user: order.userId });
      if (!wallet) {
        wallet = new Wallet({
          user: order.userId,
          balance: 0,
        });
      }

      // Add wallet transaction record
      const transaction = new WalletTransaction({
        user: order.userId,
        amount: refundAmount,
        type: "credit",
        description: `Refund for returned item in order #${orderId}`,
        status: "completed",
        orderId: orderId
      });

      wallet.balance += refundAmount;
      await wallet.save();

      logger.info("Added refund to user wallet", {
      userId: order.userId,
      amount: refundAmount,
      });

// Save the transaction
await transaction.save();
logger.info("Transaction recorded for refund", {
  transactionId: transaction._id,
  userId: order.userId,
});




      // Update product quantity
      await Product.findByIdAndUpdate(productId, {
        $inc: { quantity: item.quantity },
      });
      logger.info("Restored product quantity", { productId, quantity: item.quantity });

      // Save the order
      await order.save();

      console.log("Return approved successfully");
      res.status(StatusCodes.OK).json({
        success: true,
        message: "Return approved and refund added to user wallet",
      });
    } catch (error) {
      logger.error("Error processing return approval", { orderId, productId, error: error.message, stack: error.stack });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to process return approval",
      });
    }
  } catch (error) {
    logger.error("Error approving return", {
      orderId: req.params.orderId,
      productId: req.body.productId,
      error: error.message,
      stack: error.stack,
    });
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to approve return",
    });
  }
};

// Reject a return request
exports.rejectReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, adminResponse } = req.body;
    const adminId = req.session.admin;

    console.log("Admin reject return request:", { orderId, productId, adminResponse, adminId });

    if (!adminId) {
      logger.error("Unauthorized attempt to reject return", { orderId, productId, adminId: null });
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Admin not authenticated",
      });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      logger.error("Invalid orderId or productId format", { orderId, productId });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid order or product ID",
      });
    }

    // Validate admin response
    if (!adminResponse || adminResponse.trim() === "") {
      logger.error("Missing admin response for return rejection", { orderId, productId });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Admin response is required for rejection",
      });
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      logger.error("Order not found for return rejection", { orderId });
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Order not found",
      });
    }

    // Find the order item
    const item = order.orderedItems.find((item) => item.product.toString() === productId);
    if (!item) {
      logger.error("Item not found in order", { orderId, productId });
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Item not found in order",
      });
    }

    // Check if item has a pending return request
    if (item.status !== "Return Request" || item.order_return_status !== "Pending") {
      logger.error("Item does not have a pending return request", { orderId, productId, status: item.status });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Item does not have a pending return request",
      });
    }

    // Update item status
    item.status = "Delivered"; // Revert back to delivered
    item.order_return_status = "Rejected";
    item.adminResponse = adminResponse;

    // Save the order
    await order.save();

    console.log("Return rejected successfully");
    res.status(StatusCodes.OK).json({
      success: true,
      message: "Return request rejected",
    });
  } catch (error) {
    logger.error("Error rejecting return", {
      orderId: req.params.orderId,
      productId: req.body.productId,
      error: error.message,
      stack: error.stack,
    });
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to reject return",
    });
  }
};