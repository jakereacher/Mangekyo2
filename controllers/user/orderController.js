/**
 * Order Controller
 * Handles order-related operations such as fetching order details, tracking orders,
 * managing cancellations and returns, and generating invoices.
 */

const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

/**
 * Calculate the overall status of an order based on its items.
 */
function calculateOverallStatus(orderedItems) {
  if (!orderedItems || orderedItems.length === 0) return "Processing";

  if (orderedItems.every((item) => item.status === "Delivered")) {
    return "Delivered";
  }
  if (orderedItems.some((item) => item.status === "Out for Delivery")) {
    return "Out for Delivery";
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
  if (orderedItems.some((item) => item.status === "Return Request")) {
    return "Return Requested";
  }
  if (orderedItems.every((item) => item.status === "Returned")) {
    return "Returned";
  }
  return "Processing";
}

/**
 * Get the date associated with a specific order status.
 */
function getStatusDate(orderedItems, status) {
  if (!orderedItems || orderedItems.length === 0) return null;

  let dateField = null;

  switch (status) {
    case "Processing":
      dateField = "order_processing_date";
      break;
    case "Shipped":
      dateField = "order_shipped_date";
      break;
    case "Delivered":
      dateField = "order_delivered_date";
      break;
    case "Cancelled":
      dateField = "order_cancelled_date";
      break;
    case "Return Request":
      dateField = "order_return_request_date";
      break;
    case "Returned":
      dateField = "order_returned_date";
      break;
    default:
      return null;
  }

  for (const item of orderedItems) {
    if (item[dateField]) {
      return new Date(item[dateField]).toLocaleDateString();
    }
  }

  return null;
}

/**
 * Generate a PDF invoice for an order.
 */
function generateInvoicePDF(doc, order) {
  doc.fontSize(20).text('Mangeyko', { align: 'center' });
  doc.fontSize(12).text('Invoice', { align: 'center' });
  doc.moveDown();

  doc.moveTo(50, doc.y)
     .lineTo(550, doc.y)
     .stroke();
  doc.moveDown();

  doc.fontSize(14).text('Order Information', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Order Number: ${order.orderNumber || order._id}`);
  doc.fontSize(10).text(`Order Date: ${new Date(order.orderDate).toLocaleDateString()}`);
  doc.fontSize(10).text(`Payment Method: ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : (order.paymentMethod === 'razorpay' ? 'Online Payment' : 'Wallet')}`);
  doc.fontSize(10).text(`Payment Status: ${order.paymentStatus}`);
  doc.moveDown();

  doc.fontSize(14).text('Customer Information', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Name: ${order.userId && order.userId.fullname ? order.userId.fullname : 'Customer'}`);
  doc.fontSize(10).text(`Email: ${order.userId && order.userId.email ? order.userId.email : 'N/A'}`);
  doc.moveDown();

  doc.fontSize(14).text('Shipping Address', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`${order.shippingAddress.fullName}`);
  doc.fontSize(10).text(`${order.shippingAddress.landmark ? order.shippingAddress.landmark + ', ' : ''}`);
  doc.fontSize(10).text(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`);
  doc.fontSize(10).text(`Phone: ${order.shippingAddress.phone}`);
  doc.moveDown();

  doc.fontSize(14).text('Order Items', { underline: true });
  doc.moveDown(0.5);

  const tableTop = doc.y;
  const itemX = 50;
  const descriptionX = 150;
  const quantityX = 280;
  const priceX = 350;
  const amountX = 450;

  doc.fontSize(10).text('Item', itemX, tableTop);
  doc.fontSize(10).text('Description', descriptionX, tableTop);
  doc.fontSize(10).text('Quantity', quantityX, tableTop);
  doc.fontSize(10).text('Price', priceX, tableTop);
  doc.fontSize(10).text('Amount', amountX, tableTop);

  doc.moveTo(50, doc.y + 15)
     .lineTo(550, doc.y + 15)
     .stroke();

  let tableRow = doc.y + 25;
  let subtotal = 0;

  order.orderedItems.forEach(item => {
    const product = item.product;
    const amount = item.price * item.quantity;
    subtotal += amount;

    const productName = product.productName || product.name || 'Product';

    doc.fontSize(10).text(productName, itemX, tableRow, { width: 90 });
    doc.fontSize(10).text(`Size: ${item.size || 'N/A'}`, descriptionX, tableRow);
    doc.fontSize(10).text(item.quantity.toString(), quantityX, tableRow);
    doc.fontSize(10).text(`₹${item.price.toFixed(2)}`, priceX, tableRow);
    doc.fontSize(10).text(`₹${amount.toFixed(2)}`, amountX, tableRow);

    tableRow += 20;

    if (tableRow > 700) {
      doc.addPage();
      tableRow = 50;
    }
  });

  doc.moveTo(50, tableRow)
     .lineTo(550, tableRow)
     .stroke();

  tableRow += 20;

  doc.fontSize(10).text('Subtotal:', 350, tableRow);
  doc.fontSize(10).text(`₹${subtotal.toFixed(2)}`, amountX, tableRow);
  tableRow += 15;

  doc.fontSize(10).text('Shipping:', 350, tableRow);
  doc.fontSize(10).text(`₹${order.shippingCharge ? order.shippingCharge.toFixed(2) : '0.00'}`, amountX, tableRow);
  tableRow += 15;

  doc.fontSize(10).text('Tax:', 350, tableRow);
  const tax = subtotal * 0.09;
  doc.fontSize(10).text(`₹${tax.toFixed(2)}`, amountX, tableRow);
  tableRow += 15;

  if (order.discount && order.discount > 0) {
    doc.fontSize(10).text('Discount:', 350, tableRow);
    doc.fontSize(10).text(`-₹${order.discount.toFixed(2)}`, amountX, tableRow);
    tableRow += 15;

    // Add coupon information if available
    if (order.couponCode) {
      doc.fontSize(10).text(`Coupon Applied: ${order.couponCode}`, 350, tableRow);
      tableRow += 15;
    }
  }

  doc.moveTo(350, tableRow)
     .lineTo(550, tableRow)
     .stroke();

  tableRow += 15;

  doc.fontSize(12).text('Total:', 350, tableRow);
  doc.fontSize(12).text(`₹${order.finalAmount.toFixed(2)}`, amountX, tableRow);

  doc.fontSize(10).text('Thank you for your purchase!', 50, 700, { align: 'center' });
  doc.fontSize(8).text('This is a computer-generated invoice and does not require a signature.', 50, 720, { align: 'center' });
}

/**
 * Fetch and render the details of a specific order.
 */
const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate("orderedItems.product")
      .lean();

    if (!order) {
      return res.status(404).render("page-404");
    }

    const formattedOrderDate = new Date(order.orderDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const formattedDeliveryDate = new Date(order.deliveryDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const status = calculateOverallStatus(order.orderedItems);

    // Check if all items are cancelled
    const allItemsCancelled = order.orderedItems.every(item => item.status === 'Cancelled');

    // Get non-cancelled items
    const nonCancelledItems = order.orderedItems.filter(item => item.status !== 'Cancelled');

    // Calculate subtotal for non-cancelled items
    const subtotal = nonCancelledItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Add shipping and tax
    const shipping = order.shippingCharge || 0;
    const tax = subtotal * 0.09; // 9% tax rate

    // Calculate final amount
    let finalAmount = subtotal + shipping + tax;

    // Apply discount if applicable
    if (order.discount && order.discount > 0) {
      finalAmount -= order.discount;
    }

    // Ensure amount is not negative
    finalAmount = Math.max(0, finalAmount);

    // Calculate Razorpay amount in paise
    const razorpayAmount = Math.max(100, Math.round(finalAmount * 100));

    console.log('Order details calculation:', {
      subtotal,
      shipping,
      tax,
      discount: order.discount || 0,
      finalAmount,
      razorpayAmountInPaise: razorpayAmount
    });

    const orderDetails = {
      ...order,
      _id: order._id.toString(),
      status,
      formattedOrderDate,
      formattedDeliveryDate,
      // Display order number if available, otherwise use the ID
      displayOrderId: order.orderNumber || order._id.toString(),
      // Include cancellation information
      cancellation_status: order.cancellation_status,
      cancellation_admin_response: order.cancellation_admin_response,
      cancellation_requested_at: order.cancellation_requested_at ?
        new Date(order.cancellation_requested_at).toLocaleDateString() : null,
      cancellation_processed_at: order.cancellation_processed_at ?
        new Date(order.cancellation_processed_at).toLocaleDateString() : null,
      items: order.orderedItems.map((item) => ({
        ...item,
        product: {
          ...item.product,
          productName: item.product.name || item.product.productName,
          mainImage: item.product.productImage && item.product.productImage.length > 0
            ? item.product.productImage[0]
            : "/images/default-product.jpg",
        },
        totalPrice: (item.price * item.quantity).toFixed(2),
      })),
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      tax: tax.toFixed(2),
      discount: order.discount ? order.discount.toFixed(2) : "0.00",
      total: finalAmount.toFixed(2),
      // Include coupon information
      couponCode: order.couponCode || null,
      couponApplied: order.couponApplied || false,
      couponDetails: order.coupon || null,
      // Include Razorpay amount in paise
      razorpayAmountInPaise: razorpayAmount,
      // Flag to indicate if all items are cancelled
      allItemsCancelled: allItemsCancelled
    };

    // Get Razorpay key ID for payment retry functionality
    const { razorpayKeyId } = require("../../config/razorpay");
    const safeRazorpayKeyId = razorpayKeyId || 'rzp_test_UkVZCj9Q9Jy9Ja';

    res.render("orderDetails", {
      order: orderDetails,
      user: req.session.user ? { id: userId } : null,
      razorpayKeyId: safeRazorpayKeyId
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).render("page-404");
  }
}

/**
 * Fetch and render all orders for a user with pagination and filtering.
 */
const getUserOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    const statusFilter = req.query.status || 'all';

    if (!userId) {
      return res.redirect("/login");
    }

    const filterQuery = { userId };
    if (statusFilter !== 'all') {
      filterQuery['orderedItems.status'] = statusFilter;
    }

    const totalOrders = await Order.countDocuments(filterQuery);
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find(filterQuery)
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate("orderedItems.product")
      .lean();

    const formattedOrders = orders.map((order) => {
      const status = calculateOverallStatus(order.orderedItems);
      let progressWidth = 0;

      switch (status) {
        case "Processing":
          progressWidth = 25;
          break;
        case "Shipped":
          progressWidth = 50;
          break;
        case "Out for Delivery":
          progressWidth = 75;
          break;
        case "Delivered":
          progressWidth = 100;
          break;
        case "Cancelled":
          progressWidth = 100;
          break;
        case "Return Requested":
          progressWidth = 85;
          break;
        case "Returned":
          progressWidth = 100;
          break;
        default:
          progressWidth = 10;
      }

      return {
        ...order,
        status,
        progressWidth,
        formattedOrderDate: new Date(order.orderDate).toLocaleDateString(),
        formattedDeliveryDate: new Date(order.deliveryDate).toLocaleDateString(),
        // Display order number if available, otherwise use the ID
        displayOrderId: order.orderNumber || order._id.toString(),
        // Include coupon information
        couponCode: order.couponCode || null,
        couponApplied: order.couponApplied || false,
        couponDetails: order.coupon || null
      };
    });

    res.render("orders", {
      orders: formattedOrders,
      currentPage: page,
      totalPages,
      hasOrders: totalOrders > 0,
      statusFilter,
      user: { id: userId }
    });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    res.status(500).render("error", {
      message: "Failed to fetch orders",
      error: { status: 500 }
    });
  }
}

/**
 * Track the status of a specific order and render the tracking page.
 */
const trackOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate("orderedItems.product")
      .lean();

    if (!order) {
      return res.status(404).render("page-404");
    }

    const status = calculateOverallStatus(order.orderedItems);

    let trackingSteps = [];
    let progressWidth = 0;

    trackingSteps = [
      {
        status: "Order Placed",
        date: new Date(order.orderDate).toLocaleDateString(),
        icon: "fa-shopping-bag",
        active: true,
        completed: true
      },
      {
        status: "Processing",
        date: getStatusDate(order.orderedItems, "Processing") || "Pending",
        icon: "fa-cog",
        active: ["Processing", "Shipped", "Out for Delivery", "Delivered"].includes(status),
        completed: ["Shipped", "Out for Delivery", "Delivered"].includes(status)
      },
      {
        status: "Shipped",
        date: getStatusDate(order.orderedItems, "Shipped") || "Pending",
        icon: "fa-truck",
        active: ["Shipped", "Out for Delivery", "Delivered"].includes(status),
        completed: ["Out for Delivery", "Delivered"].includes(status)
      },
      {
        status: "Out for Delivery",
        date: getStatusDate(order.orderedItems, "Out for Delivery") || "Pending",
        icon: "fa-truck-loading",
        active: ["Out for Delivery", "Delivered"].includes(status),
        completed: ["Delivered"].includes(status)
      },
      {
        status: "Delivered",
        date: getStatusDate(order.orderedItems, "Delivered") || "Pending",
        icon: "fa-check-circle",
        active: ["Delivered"].includes(status),
        completed: ["Delivered"].includes(status)
      }
    ];

    if (status === "Cancelled") {
      trackingSteps = [
        {
          status: "Order Placed",
          date: new Date(order.orderDate).toLocaleDateString(),
          icon: "fa-shopping-bag",
          active: true,
          completed: true
        },
        {
          status: "Cancelled",
          date: getStatusDate(order.orderedItems, "Cancelled") || new Date().toLocaleDateString(),
          icon: "fa-times-circle",
          active: true,
          completed: true,
          error: true
        }
      ];
      progressWidth = 100;
    } else if (status === "Return Requested") {
      trackingSteps.push({
        status: "Return Requested",
        date: getStatusDate(order.orderedItems, "Return Request") || new Date().toLocaleDateString(),
        icon: "fa-undo-alt",
        active: true,
        completed: false
      });
      progressWidth = 85;
    } else if (status === "Returned") {
      trackingSteps.push({
        status: "Return Requested",
        date: getStatusDate(order.orderedItems, "Return Request") || new Date().toLocaleDateString(),
        icon: "fa-undo-alt",
        active: true,
        completed: true
      });
      trackingSteps.push({
        status: "Returned",
        date: getStatusDate(order.orderedItems, "Returned") || new Date().toLocaleDateString(),
        icon: "fa-box",
        active: true,
        completed: true
      });
      progressWidth = 100;
    } else {
      switch (status) {
        case "Processing":
          progressWidth = 25;
          break;
        case "Shipped":
          progressWidth = 50;
          break;
        case "Out for Delivery":
          progressWidth = 75;
          break;
        case "Delivered":
          progressWidth = 100;
          break;
        default:
          progressWidth = 10;
      }
    }

    const orderDetails = {
      ...order,
      _id: order._id.toString(),
      status,
      formattedOrderDate: new Date(order.orderDate).toLocaleDateString(),
      formattedDeliveryDate: new Date(order.deliveryDate).toLocaleDateString(),
      items: order.orderedItems.map((item) => ({
        ...item,
        product: {
          ...item.product,
          productName: item.product.name || item.product.productName,
          mainImage: item.product.productImage && item.product.productImage.length > 0
            ? item.product.productImage[0]
            : "/images/default-product.jpg",
        },
        totalPrice: (item.price * item.quantity).toFixed(2),
      })),
    };

    res.render("orderTracking", {
      order: orderDetails,
      trackingSteps,
      progressWidth,
      user: { id: userId }
    });
  } catch (error) {
    console.error("Error tracking order:", error);
    res.status(500).render("page-404");
  }
}

/**
 * Cancel a specific product in an order and update its status.
 * Handles all order types (COD, Razorpay, Wallet) directly.
 */
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;
    const { productId, cancelReason } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required for cancellation",
      });
    }

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    console.log(`Processing cancellation for order: ${orderId}, payment method: ${order.paymentMethod}, payment status: ${order.paymentStatus}`);

    const item = order.orderedItems.find(
      (item) => item.product.toString() === productId
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Product not found in order",
      });
    }

    if (item.status !== "Processing") {
      return res.status(400).json({
        success: false,
        message: "This product cannot be cancelled at its current stage",
      });
    }

    // Update item status
    item.status = "Cancelled";
    item.order_cancelled_date = new Date();
    item.order_cancel_reason = cancelReason || "User requested cancellation";

    // Calculate the cancelled item amount
    const cancelledAmount = item.price * item.quantity;

    // Recalculate order totals
    // Get all non-cancelled items (excluding the current item being cancelled)
    const nonCancelledItems = order.orderedItems.filter(i => i.status !== "Cancelled" && i._id.toString() !== item._id.toString());

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

    console.log(`Order totals updated: subtotal=${newSubtotal}, tax=${newTax}, finalAmount=${order.finalAmount}, allCancelled=${allItemsCancelled}`);

    // Process refund for paid orders (Razorpay or Wallet)
    if ((order.paymentMethod === 'razorpay' && order.paymentStatus === 'Paid') || order.paymentMethod === 'wallet') {
      try {
        // Calculate refund amount
        const refundAmount = cancelledAmount;

        // Find or create user wallet
        const Wallet = require("../../models/walletSchema");
        const WalletTransaction = require("../../models/walletTransactionSchema");

        let wallet = await Wallet.findOne({ user: userId });
        if (!wallet) {
          wallet = new Wallet({
            user: userId,
            balance: 0
          });
        }

        // Add refund to wallet
        wallet.balance += refundAmount;
        await wallet.save();

        // Create a wallet transaction record
        const transaction = new WalletTransaction({
          user: userId,
          amount: refundAmount,
          type: "credit",
          description: `Refund for cancelled item in order #${orderId.substring(0, 8)}`,
          status: "completed",
          orderId: orderId
        });

        // Save the transaction
        await transaction.save();

        console.log(`Refund processed: ${refundAmount} added to wallet for user ${userId}`);
      } catch (refundError) {
        console.error("Error processing refund:", refundError);
        // Continue with cancellation even if refund fails
        // We'll log the error but not fail the cancellation
      }
    }

    await order.save();

    // Restore product quantity
    await Product.findByIdAndUpdate(item.product, {
      $inc: { quantity: item.quantity },
    });

    res.status(200)
      .header('Content-Type', 'application/json')
      .json({
        success: true,
        message: "Product in order cancelled successfully",
      });

  } catch (error) {
    console.error("Error cancelling product in order:", error);
    res.status(500)
      .header('Content-Type', 'application/json')
      .json({
        success: false,
        message: "Failed to cancel product in order",
      });
  }
}

/**
 * Request cancellation for a Razorpay or wallet order.
 * This requires admin approval.
 */
const requestCancellation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;
    const { productId, cancellationReason } = req.body;

    if (!userId) {
      return res.status(401)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: "User not authenticated",
        });
    }

    if (!productId || !cancellationReason) {
      return res.status(400)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: "Product ID and cancellation reason are required",
        });
    }

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: "Order not found",
        });
    }

    // Verify this is a paid Razorpay or wallet order
    if (!((order.paymentMethod === 'razorpay' && order.paymentStatus === 'Paid') || order.paymentMethod === 'wallet')) {
      return res.status(400)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: "Only paid orders require cancellation requests. For COD orders or failed Razorpay payments, use the Cancel Order option.",
        });
    }

    console.log(`Processing cancellation request for order: ${orderId}, payment method: ${order.paymentMethod}, payment status: ${order.paymentStatus}`);

    const item = order.orderedItems.find(
      (item) => item.product.toString() === productId
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Product not found in order",
      });
    }

    if (item.status !== "Processing") {
      return res.status(400).json({
        success: false,
        message: "This product cannot be cancelled at its current stage",
      });
    }

    // Check if this item has been previously rejected for cancellation
    if (item.order_cancel_status === "Rejected") {
      return res.status(400).json({
        success: false,
        message: "This product's cancellation was previously rejected and cannot be cancelled again",
      });
    }

    // Update item status to Cancellation Pending
    item.status = "Cancellation Pending";
    item.order_cancel_reason = cancellationReason;
    order.cancellation_reason = cancellationReason;
    order.cancellation_status = "Pending";
    order.cancellation_requested_at = new Date();

    await order.save();

    res.status(200)
      .header('Content-Type', 'application/json')
      .json({
        success: true,
        message: "Cancellation request submitted successfully",
      });
  } catch (error) {
    console.error("Error requesting cancellation:", error);
    res.status(500)
      .header('Content-Type', 'application/json')
      .json({
        success: false,
        message: "Failed to submit cancellation request",
        error: error.message,
      });
  }
}

/**
 * Submit a return request for a specific product in an order.
 */
const requestReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, returnReason } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!returnReason) {
      return res.status(400).json({
        success: false,
        message: "Return reason is required",
      });
    }

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const item = order.orderedItems.find(
      (i) => i.product.toString() === productId
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Product not found in this order",
      });
    }

    if (item.status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "This item cannot be returned as it was not delivered",
      });
    }

    const deliveryDate = new Date(item.order_delivered_date);
    const returnPeriod = 7 * 24 * 60 * 60 * 1000;

    if (Date.now() - deliveryDate.getTime() > returnPeriod) {
      return res.status(400).json({
        success: false,
        message: "Return period has expired (7 days)",
      });
    }

    item.status = "Return Request";
    item.order_return_request_date = new Date();
    item.returnReason = returnReason;

    await order.save();

    res.status(200).json({
      success: true,
      message: "Return request submitted successfully",
    });
  } catch (error) {
    console.error("Error requesting return:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit return request",
    });
  }
}

/**
 * Generate and download the invoice for a specific order as a PDF.
 */
const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate("orderedItems.product")
      .populate("userId")
      .lean();

    if (!order) {
      return res.status(404).render("page-404");
    }

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);

    doc.pipe(res);

    generateInvoicePDF(doc, order);

    doc.end();
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).render("error", {
      message: "Failed to generate invoice",
      error: { status: 500 }
    });
  }
}

/**
 * Complete payment for an order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const completePayment = async (req, res) => {
  try {
    const { orderId, paymentId } = req.body;
    const userId = req.session.user;

    if (!orderId || !paymentId) {
      return res.status(400).json({
        success: false,
        message: "Order ID and payment ID are required"
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (order.userId.toString() !== userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access to this order"
      });
    }

    if (order.paymentStatus === "Paid") {
      return res.status(400).json({
        success: false,
        message: "Order is already paid"
      });
    }

    // Update order payment status
    order.paymentStatus = "Paid";
    order.razorpayPaymentId = paymentId;
    await order.save();

    res.status(200).json({
      success: true,
      message: "Payment completed successfully"
    });
  } catch (error) {
    console.error("Error completing payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete payment",
      error: error.message
    });
  }
};

module.exports = {
  getOrderDetails,
  getUserOrders,
  trackOrder,
  cancelOrder,
  requestReturn,
  downloadInvoice,
  completePayment
};