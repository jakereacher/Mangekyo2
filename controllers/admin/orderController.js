const mongoose = require("mongoose");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const winston = require("winston");

// Configure Winston logger
const logger = winston.createLogger({
  level: "error",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "error.log" }),
    new winston.transports.Console(),
  ],
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
  if (orderedItems.some((item) => item.status === "Cancelled")) {
    return "Cancelled";
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

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
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
      finalAmount: order.finalAmount || (order.totalPrice + order.shippingCharge + (order.taxAmount || 0)),
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
    });
  } catch (error) {
    logger.error("Error fetching all orders", { error: error.message, stack: error.stack });
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/error", {
      message: "Failed to load orders",
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
      });
    }

    const status = calculateOverallStatus(order.orderedItems);

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
      userEmail: order.userId.email,
      userName: order.userId.fullName,
    };

    res.render("admin-order-details", {
      order: orderDetails,
      admin: { id: adminId },
      csrfToken: req.csrfToken ? req.csrfToken() : "",
    });
  } catch (error) {
    logger.error("Error fetching admin order details", { orderId: req.params.orderId, error: error.message, stack: error.stack });
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/error", {
      message: "Failed to load order details",
    });
  }
};

// Update order item status (admin)
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

    const item = order.orderedItems.find(
      (item) => item.product.toString() === productId
    );
    if (!item) {
      logger.error("Item not found in order", { orderId, productId });
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Item not found in order",
      });
    }

    const product = await Product.findById(productId);
    if (status === "Cancelled" && item.status !== "Cancelled") {
      try {
        await Product.findByIdAndUpdate(productId, {
          $inc: { quantity: item.quantity },
        });
        logger.info("Restored product quantity", { productId, quantity: item.quantity });
      } catch (error) {
        logger.error("Failed to restore product quantity", { productId, error: error.message });
      }
    }

    if (item.status === "Cancelled" && status !== "Cancelled") {
      if (product.quantity < item.quantity) {
        logger.error("Insufficient stock for status update", { productId, available: product.quantity, required: item.quantity });
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: `Insufficient stock to ship item ${product.productName}. Available: ${product.quantity}`,
        });
      }
      try {
        await Product.findByIdAndUpdate(productId, {
          $inc: { quantity: -item.quantity },
        });
        logger.info("Reduced product quantity", { productId, quantity: item.quantity });
      } catch (error) {
        logger.error("Failed to reduce product quantity", { productId, error: error.message });
      }
    }

    const oldStatus = item.status;
    item.status = status;
    await order.save();

    if (
      order.paymentMethod === "cod" &&
      order.orderedItems.every((item) => item.status === "Delivered")
    ) {
      order.paymentStatus = "Paid";
      await order.save();
      logger.info("Updated payment status to Paid", { orderId });
    }

    // Audit log (remove this block if you don't need audit logging)
    const Log = require("../../models/logSchema");
    await Log.create({
      action: "Order Item Status Update",
      orderId,
      productId,
      oldStatus,
      newStatus: status,
      adminId,
      timestamp: new Date(),
    });
    logger.info("Audit log created for status update", { orderId, productId, status });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Item status updated successfully",
    });
  } catch (error) {
    logger.error("Error updating item status", { orderId: req.params.orderId, productId: req.body.productId, error: error.message, stack: error.stack });
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to update item status",
    });
  }
};