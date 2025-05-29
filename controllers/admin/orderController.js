/**
 * OrderController
 */

const mongoose = require("mongoose");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Wallet = require("../../models/walletSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const winston = require("winston");

//=================================================================================================
// Logger
//=================================================================================================
// This is a logger for the order controller.
// It logs the errors and other information to the console and a file.
//=================================================================================================
const logger = winston.createLogger({
  level: "error",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.File({ filename: "error.log" }), new winston.transports.Console()],
});

//=================================================================================================
// Calculate Overall Status
//=================================================================================================
// This function calculates the overall status of the order.
// It returns the overall status of the order.
//=================================================================================================
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

//=================================================================================================
// Get All Orders
//=================================================================================================
// This function gets all the orders with pagination.
// It displays the orders in the orders page.
//=================================================================================================
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

      displayOrderId: order.orderNumber || `MK${order._id.toString().slice(-5)}`
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

//=================================================================================================
// Get Admin Order Details
//=================================================================================================
// This function gets the order details for the admin.
// It displays the order details in the order details page.
//=================================================================================================
exports.getAdminOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const adminId = req.session.admin;
    if (!adminId) {
      logger.error("Unauthorized access to /admin/orders/:orderId", { orderId, adminId: null });
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

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

    const status = calculateOverallStatus(order.orderedItems);

    const allItemsCancelled = order.orderedItems.every(item => item.status === "Cancelled");

    const nonCancelledItems = order.orderedItems.filter(item => item.status !== "Cancelled");

    const subtotal = nonCancelledItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const shipping = order.shippingCharge || 0;
    const tax = order.taxAmount || (subtotal * 0.09); // Default tax rate if not specified

    let finalAmount = subtotal + shipping + tax;

    if (order.discount && order.discount > 0) {
      finalAmount -= order.discount;
    }

    finalAmount = Math.max(0, finalAmount);

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

        originalPrice: item.originalPrice || item.price,
        discountPercentage: item.discountPercentage || 0,
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

      displayOrderId: order.orderNumber || `MK${order._id.toString().slice(-5)}`
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

//=================================================================================================
// Update Order Item Status
//=================================================================================================
// This function updates the status of an item in an order.
// It updates the status of the item in the database.
//=================================================================================================
exports.updateOrderItemStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, status } = req.body;
    const adminId = req.session.admin;
    if (!adminId) {
      logger.error("Unauthorized attempt to update item status", { orderId, productId, adminId: null });
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Admin not authenticated",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      logger.error("Invalid orderId format", { orderId });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid order ID",
      });
    }

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

    try {
      const product = await Product.findById(productId);

      if (status === "Cancelled" && item.status !== "Cancelled") {
        const updatedProduct = await Product.findByIdAndUpdate(
          productId,
          { $inc: { quantity: item.quantity } },
          { new: true }
        );

        if (updatedProduct.quantity > 0 && updatedProduct.status !== "Available") {
          updatedProduct.status = "Available";
          await updatedProduct.save();
        }
        logger.info("Restored product quantity", { productId, quantity: item.quantity });

        if (order.paymentStatus === "Paid" || order.paymentMethod === "razorpay" || order.paymentMethod === "wallet") {
          const refundAmount = item.price * item.quantity;
          let wallet = await Wallet.findOne({ user: order.userId });
          if (!wallet) {
            wallet = new Wallet({ user: order.userId, balance: 0 });
          }

          wallet.balance += refundAmount;
          await wallet.save();

          const transaction = new WalletTransaction({
            user: order.userId,
            amount: refundAmount,
            type: "credit",
            description: `Refund for cancelled item in order #${order.orderNumber || `MK${orderId.slice(-5)}`}`,
            status: "completed",
            orderId: orderId
          });
          await transaction.save();

          logger.info("Added refund to user wallet", { userId: order.userId, amount: refundAmount });
        }

        order.cancelledBy = "admin";
        order.cancelledAt = new Date();


        const nonCancelledItems = order.orderedItems.filter(i =>
          i.status !== "Cancelled" && i._id.toString() !== item._id.toString()
        );

        const newSubtotal = nonCancelledItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

        order.totalPrice = newSubtotal;

        const newTax = newSubtotal * 0.09;
        order.taxAmount = newTax;

        const newFinalAmount = newSubtotal + (order.shippingCharge || 0) + newTax - (order.discount || 0);
        order.finalAmount = Math.max(0, newFinalAmount); // Ensure it's not negative

        const allItemsCancelled = order.orderedItems.every(i =>
          i.status === "Cancelled" || i._id.toString() === item._id.toString()
        );

        if (allItemsCancelled) {
          order.orderStatus = "Cancelled";

          if (order.paymentStatus === 'Pending' || order.paymentStatus === 'Failed') {
            order.paymentStatus = 'Cancelled';
          }
        }
      }

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

        if (updatedProduct.quantity <= 0 && updatedProduct.status !== "Out of Stock") {
          updatedProduct.status = "Out of Stock";
          await updatedProduct.save();
        }
        logger.info("Reduced product quantity", { productId, quantity: item.quantity });
      }

      if (status === "Delivered" && item.status !== "Delivered") {
        item.order_delivered_date = new Date();
      } else if (status === "Shipped" && item.status !== "Shipped") {
        item.order_shipped_date = new Date();
      } else if (status === "Cancelled" && item.status !== "Cancelled") {
        item.order_cancelled_date = new Date();
        item.order_cancel_reason = "Cancelled by admin";
      }

      const oldStatus = item.status;
      item.status = status;

      await order.save();

      if (order.paymentMethod === "cod" && order.orderedItems.every((item) => item.status === "Delivered")) {
        order.paymentStatus = "Paid";
        await order.save();
        logger.info("Updated payment status to Paid", { orderId });
      }
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

//=================================================================================================
// Get Return Requests
//=================================================================================================
// This function gets the return requests with pagination.
// It displays the return requests in the return requests page.
//=================================================================================================

exports.getReturnRequests = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      logger.error("Unauthorized access to /admin/return-requests", { adminId: null });
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 2; // Default to 2 requests per page
    const skip = (page - 1) * limit;

    const orders = await Order.find({
      "orderedItems.status": "Return Request",
    })
      .populate("userId", "email fullName")
      .populate("orderedItems.product")
      .sort({ orderDate: -1 })
      .lean();

    let returnRequests = [];
    orders.forEach((order) => {
      order.orderedItems.forEach((item) => {
        if (item.status === "Return Request") {
          returnRequests.push({
            orderId: order._id,
            displayOrderId: order.orderNumber || `MK${order._id.toString().slice(-5)}`,
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

    const totalItems = returnRequests.length;

    const totalPages = Math.ceil(totalItems / limit) || 1; // Ensure at least 1 page even if no items

    returnRequests = returnRequests.slice(skip, skip + limit);

    const searchParams = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';
    const searchParamsWithoutLimit = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';

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

//=================================================================================================
// Approve Return
//=================================================================================================
// This function approves a return.
// It updates the status of the return in the database.
//=================================================================================================
exports.approveReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId } = req.body;
    const adminId = req.session.admin;
    if (!adminId) {
      logger.error("Unauthorized attempt to approve return", { orderId, productId, adminId: null });
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Admin not authenticated",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      logger.error("Invalid orderId or productId format", { orderId, productId });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid order or product ID",
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      logger.error("Order not found for return approval", { orderId });
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

    if (item.status !== "Return Request" || item.order_return_status !== "Pending") {
      logger.error("Item does not have a pending return request", { orderId, productId, status: item.status });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Item does not have a pending return request",
      });
    }

    item.status = "Returned";
    item.order_return_status = "Approved";
    item.order_returned_date = new Date();
    refundAmount = item.price * item.quantity; // Calculate refund amount

    try {

      let wallet = await Wallet.findOne({ user: order.userId });
      if (!wallet) {
        wallet = new Wallet({
          user: order.userId,
          balance: 0,
        });
      }

      const transaction = new WalletTransaction({
        user: order.userId,
        amount: refundAmount,
        type: "credit",
        description: `Refund for returned item in order #${order.orderNumber || `MK${orderId.slice(-5)}`}`,
        status: "completed",
        orderId: orderId
      });

      wallet.balance += refundAmount;
      await wallet.save();

      logger.info("Added refund to user wallet", {
      userId: order.userId,
      amount: refundAmount,
      });

await transaction.save();
logger.info("Transaction recorded for refund", {
  transactionId: transaction._id,
  userId: order.userId,
});

      await Product.findByIdAndUpdate(productId, {
        $inc: { quantity: item.quantity },
      });
      logger.info("Restored product quantity", { productId, quantity: item.quantity });

      await order.save();
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

//=================================================================================================
// Reject Return
//=================================================================================================
// This function rejects a return.
// It updates the status of the return in the database.
//=================================================================================================
exports.rejectReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, adminResponse } = req.body;
    const adminId = req.session.admin;
    if (!adminId) {
      logger.error("Unauthorized attempt to reject return", { orderId, productId, adminId: null });
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Admin not authenticated",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      logger.error("Invalid orderId or productId format", { orderId, productId });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid order or product ID",
      });
    }

    if (!adminResponse || adminResponse.trim() === "") {
      logger.error("Missing admin response for return rejection", { orderId, productId });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Admin response is required for rejection",
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      logger.error("Order not found for return rejection", { orderId });
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

    if (item.status !== "Return Request" || item.order_return_status !== "Pending") {
      logger.error("Item does not have a pending return request", { orderId, productId, status: item.status });
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Item does not have a pending return request",
      });
    }

    item.status = "Delivered"; // Revert back to delivered
    item.order_return_status = "Rejected";
    item.adminResponse = adminResponse;

    await order.save();
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
