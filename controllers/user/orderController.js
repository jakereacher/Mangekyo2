const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// Helper function to calculate overall order status
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

// Helper function to get the date for a specific status
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
  
  // Find the first item with the date field set
  for (const item of orderedItems) {
    if (item[dateField]) {
      return new Date(item[dateField]).toLocaleDateString();
    }
  }
  
  return null;
}

// Helper function to generate invoice PDF
function generateInvoicePDF(doc, order) {
  // Add company logo and header
  doc.fontSize(20).text('Mangeyko', { align: 'center' });
  doc.fontSize(12).text('Invoice', { align: 'center' });
  doc.moveDown();
  
  // Add a horizontal line
  doc.moveTo(50, doc.y)
     .lineTo(550, doc.y)
     .stroke();
  doc.moveDown();
  
  // Add order information
  doc.fontSize(14).text('Order Information', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Order ID: ${order._id}`);
  doc.fontSize(10).text(`Order Date: ${new Date(order.orderDate).toLocaleDateString()}`);
  doc.fontSize(10).text(`Payment Method: ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Wallet'}`);
  doc.fontSize(10).text(`Payment Status: ${order.paymentStatus}`);
  doc.moveDown();
  
  // Add customer information
  doc.fontSize(14).text('Customer Information', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Name: ${order.userId && order.userId.fullname ? order.userId.fullname : 'Customer'}`);
  doc.fontSize(10).text(`Email: ${order.userId && order.userId.email ? order.userId.email : 'N/A'}`);
  doc.moveDown();
  
  // Add shipping address
  doc.fontSize(14).text('Shipping Address', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`${order.shippingAddress.fullName}`);
  doc.fontSize(10).text(`${order.shippingAddress.landmark ? order.shippingAddress.landmark + ', ' : ''}`);
  doc.fontSize(10).text(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`);
  doc.fontSize(10).text(`Phone: ${order.shippingAddress.phone}`);
  doc.moveDown();
  
  // Add order items table
  doc.fontSize(14).text('Order Items', { underline: true });
  doc.moveDown(0.5);
  
  // Table header
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
  
  // Draw a line below the header
  doc.moveTo(50, doc.y + 15)
     .lineTo(550, doc.y + 15)
     .stroke();
  
  // Table rows
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
    
    // Add a new page if we're at the bottom
    if (tableRow > 700) {
      doc.addPage();
      tableRow = 50;
    }
  });
  
  // Draw a line below the items
  doc.moveTo(50, tableRow)
     .lineTo(550, tableRow)
     .stroke();
  
  tableRow += 20;
  
  // Order summary
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
  }
  
  // Draw a line above the total
  doc.moveTo(350, tableRow)
     .lineTo(550, tableRow)
     .stroke();
  
  tableRow += 15;
  
  // Total
  doc.fontSize(12).text('Total:', 350, tableRow);
  doc.fontSize(12).text(`₹${order.finalAmount.toFixed(2)}`, amountX, tableRow);
  
  // Footer
  doc.fontSize(10).text('Thank you for your purchase!', 50, 700, { align: 'center' });
  doc.fontSize(8).text('This is a computer-generated invoice and does not require a signature.', 50, 720, { align: 'center' });
}

// Get order details
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
    console.log(`here is ${order}`);
    if (!order) {
      return res.status(404).render("page-404");
    }

    // Format dates
    const formattedOrderDate = new Date(order.orderDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    
    const formattedDeliveryDate = new Date(order.deliveryDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    // Calculate overall order status based on items
    const status = calculateOverallStatus(order.orderedItems);
    console.log(order);
    // Format order data for the template
    const orderDetails = {
      ...order,
      _id: order._id.toString(),
      status,
      formattedOrderDate,
      formattedDeliveryDate,
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
      subtotal: order.totalPrice.toFixed(2),
      shipping: order.shippingCharge ? order.shippingCharge.toFixed(2) : "0.00",
      tax: (order.totalPrice * 0.09).toFixed(2),
      discount: order.discount ? order.discount.toFixed(2) : "0.00",
      total: order.finalAmount.toFixed(2),
    };

    console.log("Rohan: ", orderDetails);
    res.render("orderDetails", {
      order: orderDetails,
      user: req.session.user ? { id: userId } : null,
      
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).render("page-404");
  }
};

// Get all orders for a user
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

    // Build filter query
    const filterQuery = { userId };
    if (statusFilter !== 'all') {
      // For specific status filtering
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

    // Format orders with overall status
    const formattedOrders = orders.map((order) => {
      const status = calculateOverallStatus(order.orderedItems);
      let progressWidth = 0;
      
      // Calculate progress width based on status
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
};

// Track an order
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

    // Calculate overall order status
    const status = calculateOverallStatus(order.orderedItems);
    
    // Create tracking steps based on status
    let trackingSteps = [];
    let progressWidth = 0;
    
    // Default tracking steps
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
    
    // Handle special statuses
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
      // Calculate progress width for normal flow
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

    // Format order for template
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
};

// Cancel an order
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;
    const { cancelReason } = req.body || { cancelReason: "User requested cancellation" };

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order can be cancelled (only Processing orders can be cancelled)
    const canCancel = order.orderedItems.every(
      (item) => item.status === "Processing"
    );

    if (!canCancel) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled at this stage",
      });
    }

    // Update order status
    order.orderedItems.forEach((item) => {
      item.status = "Cancelled";
      item.order_cancelled_date = new Date();
    });
    
    order.cancellation_reason = cancelReason;
    await order.save();

    // Restore product quantities
    await Promise.all(
      order.orderedItems.map(async (item) => {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { quantity: item.quantity },
        });
      })
    );

    // Refund wallet if payment was made with wallet
    if (order.paymentMethod === "wallet") {
      await User.findByIdAndUpdate(userId, {
        $inc: { wallet: order.finalAmount },
      });
    }

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel order",
    });
  }
};

// Request a return for an order
// Request a return for an order
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

    // Find the specific product in the orderedItems
    const item = order.orderedItems.find(
      (i) => i.product.toString() === productId
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Product not found in this order",
      });
    }

    // Check if the product was delivered
    if (item.status !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "This item cannot be returned as it was not delivered",
      });
    }

    // Check return window (7 days from delivery)
    const deliveryDate = new Date(item.order_delivered_date);
    const returnPeriod = 7 * 24 * 60 * 60 * 1000;

    if (Date.now() - deliveryDate.getTime() > returnPeriod) {
      return res.status(400).json({
        success: false,
        message: "Return period has expired (7 days)",
      });
    }

    // Update only this item's status
    item.status = "Return Request";
    item.order_return_request_date = new Date();
    item.return_reason = returnReason;

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
};

// const requestReturn = async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     console.log(orderId)
//     const productId = req.body.productId;
//     console.log(productId)
//     const userId = req.session.user;
//     const { returnReason } = req.body;

//     if (!userId) {
//       return res.status(401).json({
//         success: false,
//         message: "User not authenticated",
//       });
//     }

//     if (!returnReason) {
//       return res.status(400).json({
//         success: false,
//         message: "Return reason is required",
//       });
//     }

//     const order = await Order.findOne({ _id: orderId, userId });

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     // Check if order can be returned (only Delivered orders can be returned)
//     // Changed from every to some - at least some items should be delivered to request return
//     const canReturn = order.orderedItems.some(
//       (item) => item.status === "Delivered"
//     );

//     if (!canReturn) {
//       return res.status(400).json({
//         success: false,
//         message: "Order cannot be returned at this stage",
//       });
//     }

//     // Check if return period has expired (changed from 14 days to 7 days)
//     const deliveryDate = order.orderedItems.reduce((latest, item) => {
//       if (item.order_delivered_date && new Date(item.order_delivered_date) > latest) {
//         return new Date(item.order_delivered_date);
//       }
//       return latest;
//     }, new Date(0));

//     const returnPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
//     if (Date.now() - deliveryDate.getTime() > returnPeriod) {
//       return res.status(400).json({
//         success: false,
//         message: "Return period has expired (7 days)",
//       });
//     }

//     // Update order status - only update delivered items
//     order.orderedItems.forEach((item) => {
//       if (item.status === "Delivered") {
//         item.status = "Return Request";
//         item.order_return_request_date = new Date();
//       }
//     });
    
//     order.return_reason = returnReason;
//     await order.save();

//     res.status(200).json({
//       success: true,
//       message: "Return request submitted successfully",
//     });
//   } catch (error) {
//     console.error("Error requesting return:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to submit return request",
//     });
//   }
// };

// Generate and download invoice
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

    // Create a PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);
    
    // Pipe the PDF to the response
    doc.pipe(res);
    
    // Add content to the PDF
    generateInvoicePDF(doc, order);
    
    // Finalize the PDF
    doc.end();
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).render("error", { 
      message: "Failed to generate invoice",
      error: { status: 500 }
    });
  }
};

// Export all controller functions
module.exports = {
  getOrderDetails,
  getUserOrders,
  trackOrder,
  cancelOrder,
  requestReturn,
  downloadInvoice
};