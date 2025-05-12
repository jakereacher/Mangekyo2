/**
 * Admin Report Controller
 * Handles generating and displaying sales reports and analytics
 */

const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const mongoose = require("mongoose");
const moment = require("moment");

/**
 * Render the sales report page
 */
exports.renderSalesReport = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    // Get filter parameters
    const startDate = req.query.startDate ? new Date(req.query.startDate) : moment().subtract(30, 'days').toDate();
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    
    // Set end date to end of day
    endDate.setHours(23, 59, 59, 999);

    // Build filter query
    const filterQuery = {
      orderDate: { $gte: startDate, $lte: endDate }
    };

    if (paymentMethod !== 'all') {
      filterQuery.paymentMethod = paymentMethod;
    }

    // Get all orders based on filters
    const orders = await Order.find(filterQuery)
      .populate("userId", "email name")
      .populate("orderedItems.product")
      .sort({ orderDate: -1 })
      .lean();

    // Filter orders by status if needed
    let filteredOrders = orders;
    if (orderStatus !== 'all') {
      filteredOrders = orders.filter(order => {
        // Check if any item has the requested status
        if (orderStatus === 'Cancelled') {
          return order.orderedItems.some(item => item.status === 'Cancelled');
        } else if (orderStatus === 'Returned') {
          return order.orderedItems.some(item => item.status === 'Returned');
        } else if (orderStatus === 'Delivered') {
          return order.orderedItems.some(item => item.status === 'Delivered');
        } else {
          return order.orderedItems.some(item => item.status === orderStatus);
        }
      });
    }

    // Calculate summary statistics
    const totalSales = filteredOrders.reduce((sum, order) => sum + order.finalAmount, 0);
    const totalOrders = filteredOrders.length;
    const totalProducts = filteredOrders.reduce((sum, order) => 
      sum + order.orderedItems.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
    
    // Calculate sales by payment method
    const salesByPaymentMethod = {
      cod: 0,
      razorpay: 0,
      wallet: 0
    };

    filteredOrders.forEach(order => {
      if (order.paymentMethod === 'cod') {
        salesByPaymentMethod.cod += order.finalAmount;
      } else if (order.paymentMethod === 'razorpay') {
        salesByPaymentMethod.razorpay += order.finalAmount;
      } else if (order.paymentMethod === 'wallet') {
        salesByPaymentMethod.wallet += order.finalAmount;
      }
    });

    // Calculate sales by date for chart
    const salesByDate = {};
    const dateFormat = totalDays => {
      if (totalDays <= 31) return 'YYYY-MM-DD'; // Daily for a month or less
      if (totalDays <= 90) return 'YYYY-MM'; // Monthly for up to 3 months
      return 'YYYY'; // Yearly for longer periods
    };

    const daysDiff = moment(endDate).diff(moment(startDate), 'days');
    const format = dateFormat(daysDiff);

    filteredOrders.forEach(order => {
      const dateKey = moment(order.orderDate).format(format);
      if (!salesByDate[dateKey]) {
        salesByDate[dateKey] = 0;
      }
      salesByDate[dateKey] += order.finalAmount;
    });

    // Get top selling products
    const productSales = {};
    filteredOrders.forEach(order => {
      order.orderedItems.forEach(item => {
        if (item.product) {
          const productId = item.product._id.toString();
          if (!productSales[productId]) {
            productSales[productId] = {
              id: productId,
              name: item.product.productName,
              quantity: 0,
              revenue: 0
            };
          }
          productSales[productId].quantity += item.quantity;
          productSales[productId].revenue += (item.price * item.quantity);
        }
      });
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Format data for rendering
    const formattedOrders = filteredOrders.map(order => ({
      ...order,
      formattedOrderDate: moment(order.orderDate).format('YYYY-MM-DD'),
      customerName: order.userId ? order.userId.name : 'Unknown',
      customerEmail: order.userId ? order.userId.email : 'Unknown',
      items: order.orderedItems.map(item => ({
        ...item,
        productName: item.product ? item.product.productName : 'Unknown Product',
        totalPrice: (item.quantity * item.price).toFixed(2)
      }))
    }));

    res.render("admin-sales-report", {
      orders: formattedOrders,
      totalSales,
      totalOrders,
      totalProducts,
      salesByPaymentMethod,
      salesByDate: JSON.stringify(salesByDate),
      topProducts,
      filters: {
        startDate: moment(startDate).format('YYYY-MM-DD'),
        endDate: moment(endDate).format('YYYY-MM-DD'),
        paymentMethod,
        orderStatus
      },
      activePage: "reports"
    });
  } catch (error) {
    console.error("Error generating sales report:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/error", {
      message: "Failed to generate sales report",
      activePage: "reports"
    });
  }
};

/**
 * Generate and download sales report as CSV
 */
exports.downloadSalesReport = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    // Get filter parameters
    const startDate = req.query.startDate ? new Date(req.query.startDate) : moment().subtract(30, 'days').toDate();
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    
    // Set end date to end of day
    endDate.setHours(23, 59, 59, 999);

    // Build filter query
    const filterQuery = {
      orderDate: { $gte: startDate, $lte: endDate }
    };

    if (paymentMethod !== 'all') {
      filterQuery.paymentMethod = paymentMethod;
    }

    // Get all orders based on filters
    const orders = await Order.find(filterQuery)
      .populate("userId", "email name")
      .populate("orderedItems.product")
      .sort({ orderDate: -1 })
      .lean();

    // Filter orders by status if needed
    let filteredOrders = orders;
    if (orderStatus !== 'all') {
      filteredOrders = orders.filter(order => {
        // Check if any item has the requested status
        if (orderStatus === 'Cancelled') {
          return order.orderedItems.some(item => item.status === 'Cancelled');
        } else if (orderStatus === 'Returned') {
          return order.orderedItems.some(item => item.status === 'Returned');
        } else if (orderStatus === 'Delivered') {
          return order.orderedItems.some(item => item.status === 'Delivered');
        } else {
          return order.orderedItems.some(item => item.status === orderStatus);
        }
      });
    }

    // Generate CSV content
    let csvContent = "Order ID,Date,Customer,Payment Method,Items,Quantity,Amount\n";
    
    filteredOrders.forEach(order => {
      const orderId = order.orderId;
      const date = moment(order.orderDate).format('YYYY-MM-DD');
      const customer = order.userId ? `${order.userId.name} (${order.userId.email})` : 'Unknown';
      const paymentMethod = order.paymentMethod;
      
      order.orderedItems.forEach(item => {
        const productName = item.product ? item.product.productName : 'Unknown Product';
        const quantity = item.quantity;
        const amount = (item.price * item.quantity).toFixed(2);
        
        csvContent += `"${orderId}","${date}","${customer}","${paymentMethod}","${productName}","${quantity}","${amount}"\n`;
      });
    });

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.csv`);
    
    // Send CSV content
    res.send(csvContent);
  } catch (error) {
    console.error("Error downloading sales report:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to download sales report"
    });
  }
};
