/**
 * Admin Controller
 */

const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Review = require("../../models/reviewSchema");
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');
const moment = require("moment");
const StatusCodes = require("../../utils/httpStatusCodes");



//=================================================================================================
// Load Login
//=================================================================================================
// This function loads the login page.
// It checks if the user is already logged in and redirects to the dashboard if so.
//=================================================================================================
const loadLogin = (req,res) => {
  if(req.session.admin) return res.redirect("/admin/dashboard");
  res.render("admin-login", { message: null });
}

//=================================================================================================
// Login
//=================================================================================================
// This function logs in an admin user.
// It checks the admin's email and password, and redirects to the dashboard if successful.
//=================================================================================================
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await User.findOne({ email, isAdmin: true });
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.render('admin-login', { message: 'Invalid credentials' });
    }

    req.session.admin = true;
    res.redirect('/admin/dashboard');

  } catch (error) {
    res.render('admin-login', { message: 'Login failed' });
  }
};

//=================================================================================================
// Get Top Reviewed Products
//=================================================================================================
// This function gets the top reviewed products for the dashboard.
// It aggregates products by review count and average rating.
//=================================================================================================
const getTopReviewedProducts = async () => {
  try {
    const topReviewedProducts = await Review.aggregate([
      {
        $group: {
          _id: "$product",
          reviewCount: { $sum: 1 },
          averageRating: { $avg: "$rating" },
          latestReview: { $max: "$createdAt" }
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      {
        $unwind: "$productInfo"
      },
      {
        $lookup: {
          from: "categories",
          localField: "productInfo.category",
          foreignField: "_id",
          as: "categoryInfo"
        }
      },
      {
        $unwind: { path: "$categoryInfo", preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          _id: 1,
          productName: "$productInfo.productName",
          productImage: "$productInfo.image",
          category: { $ifNull: ["$categoryInfo.name", "Uncategorized"] },
          price: "$productInfo.price",
          reviewCount: 1,
          averageRating: { $round: ["$averageRating", 1] },
          latestReview: 1,
          isBlocked: "$productInfo.isBlocked"
        }
      },
      {
        $match: {
          isBlocked: { $ne: true },
          reviewCount: { $gte: 1 }
        }
      },
      {
        $sort: { reviewCount: -1, averageRating: -1 }
      },
      {
        $limit: 10
      }
    ]);

    return topReviewedProducts;
  } catch (error) {
    console.error('Error fetching top reviewed products:', error);
    return [];
  }
};

//=================================================================================================
// Load Dashboard
//=================================================================================================
// This function loads the dashboard page.
// It displays various statistics and charts about the site's performance.
//=================================================================================================
const loadDashboard = async(req, res) => {
  try {
    if(!req.session.admin) return res.redirect("/admin/login");

    const userCount = await User.countDocuments({ isAdmin: false });
    const productCount = await Product.countDocuments();
    const orderCount = await Order.countDocuments();
    const categoryCount = await Category.countDocuments();

    // Enhanced filtering parameters
    const period = req.query.period || 'month';
    const month = req.query.month; // For specific month selection (format: YYYY-MM)
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const sortBy = req.query.sortBy || 'date';
    const sortOrder = req.query.sortOrder || 'desc';

    // Date range handling
    const currentDate = new Date();
    let startDate, endDate, groupFormat;

    // Custom date range support
    if (req.query.startDate && req.query.endDate) {
      startDate = new Date(req.query.startDate);
      endDate = new Date(req.query.endDate);
      endDate.setHours(23, 59, 59, 999); // End of day
    } else {
      // Use period-based date ranges
      switch(period) {
        case 'today':
          startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
          endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1);
          groupFormat = { year: { $year: "$orderDate" }, month: { $month: "$orderDate" }, day: { $dayOfMonth: "$orderDate" }, hour: { $hour: "$orderDate" } };
          break;
        case 'week':
          startDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          endDate = currentDate;
          groupFormat = { year: { $year: "$orderDate" }, month: { $month: "$orderDate" }, day: { $dayOfMonth: "$orderDate" } };
          break;
        case 'year':
          startDate = new Date(currentDate.getFullYear(), 0, 1);
          endDate = new Date(currentDate.getFullYear() + 1, 0, 1);
          groupFormat = { year: { $year: "$orderDate" }, month: { $month: "$orderDate" } };
          break;
        case 'month':
        default:
          if (month) {
            // Handle specific month selection (format: YYYY-MM)
            const [year, monthNum] = month.split('-');
            const selectedYear = parseInt(year);
            const selectedMonth = parseInt(monthNum) - 1; // JavaScript months are 0-indexed

            startDate = new Date(selectedYear, selectedMonth, 1);

            // Check if it's the current month
            const now = new Date();
            const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

            if (isCurrentMonth) {
              // For current month, end date is current date
              endDate = new Date();
              endDate.setHours(23, 59, 59, 999);
            } else {
              // For past months, end date is the last day of that month
              endDate = new Date(selectedYear, selectedMonth + 1, 1);
            }
          } else {
            // Default to current month
            startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            // For current month, end date should be current date if it's the current month
            // For past months, end date should be the last day of that month
            const isCurrentMonth = currentDate.getFullYear() === new Date().getFullYear() &&
                                   currentDate.getMonth() === new Date().getMonth();
            if (isCurrentMonth) {
              endDate = new Date(); // Current date and time
              endDate.setHours(23, 59, 59, 999); // End of current day
            } else {
              endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            }
          }
          groupFormat = { year: { $year: "$orderDate" }, month: { $month: "$orderDate" }, day: { $dayOfMonth: "$orderDate" } };
          break;
      }
    }

    // Build filter conditions for orders
    const orderFilter = {
      orderDate: { $gte: startDate, $lt: endDate }
    };

    // Add payment method filter
    if (paymentMethod !== 'all') {
      orderFilter.paymentMethod = paymentMethod;
    }

    // Add order status filter - check if any item in the order has the specified status
    if (orderStatus !== 'all') {
      orderFilter['orderedItems.status'] = orderStatus;
    }

    const revenueByPeriod = await Order.aggregate([
      {
        $match: orderFilter
      },
      {
        $group: {
          _id: groupFormat,
          revenue: { $sum: "$finalAmount" },
          orders: { $sum: 1 }
        }
      },
      {
        $match: {
          _id: { $ne: null }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1 }
      }
    ]);

    const revenueData = {
      labels: [],
      values: [],
      period: period
    };
    if (period === 'today') {
      for (let i = 0; i < 24; i++) {
        const hour = i;
        const hourData = revenueByPeriod.find(d => d && d._id && typeof d._id.hour === 'number' && d._id.hour === hour);
        revenueData.labels.push(`${hour.toString().padStart(2, '0')}:00`);
        revenueData.values.push(hourData ? (hourData.revenue || 0) : 0);
      }
    } else if (period === 'week') {
      for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dayData = revenueByPeriod.find(d =>
          d && d._id &&
          typeof d._id.year === 'number' && d._id.year === date.getFullYear() &&
          typeof d._id.month === 'number' && d._id.month === date.getMonth() + 1 &&
          typeof d._id.day === 'number' && d._id.day === date.getDate()
        );
        revenueData.labels.push(moment(date).format('MMM DD'));
        revenueData.values.push(dayData ? (dayData.revenue || 0) : 0);
      }
    } else if (period === 'year') {
      for (let i = 0; i < 12; i++) {
        const month = i + 1;
        const monthData = revenueByPeriod.find(d => d && d._id && typeof d._id.month === 'number' && d._id.month === month);
        revenueData.labels.push(moment().month(i).format('MMM'));
        revenueData.values.push(monthData ? (monthData.revenue || 0) : 0);
      }
    } else {
      // Handle month view (either current month or specific month)
      let targetYear, targetMonth;
      if (month) {
        const [year, monthNum] = month.split('-');
        targetYear = parseInt(year);
        targetMonth = parseInt(monthNum) - 1; // JavaScript months are 0-indexed
      } else {
        targetYear = currentDate.getFullYear();
        targetMonth = currentDate.getMonth();
      }

      const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const dayData = revenueByPeriod.find(d => d && d._id && typeof d._id.day === 'number' && d._id.day === i);
        revenueData.labels.push(i.toString());
        revenueData.values.push(dayData ? (dayData.revenue || 0) : 0);
      }
    }

    const paymentMethodsData = await Order.aggregate([
      {
        $match: orderFilter
      },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          total: { $sum: "$finalAmount" }
        }
      },
      {
        $sort: { total: -1 }
      }
    ]);

    const formattedPaymentData = {
      labels: paymentMethodsData.map(p => {
        const method = p._id || 'Other';
        return method.charAt(0).toUpperCase() + method.slice(1);
      }),
      values: paymentMethodsData.map(p => p.total),
      counts: paymentMethodsData.map(p => p.count)
    };

    const topProductsData = await Order.aggregate([
      {
        $match: orderFilter
      },
      { $unwind: "$orderedItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$orderedItems.product",
          productName: { $first: "$productInfo.productName" },
          totalRevenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
          totalQuantity: { $sum: "$orderedItems.quantity" },
          averagePrice: { $avg: "$orderedItems.price" },
          orderCount: { $sum: 1 }
        }
      },
      {
        $match: {
          _id: { $ne: null },
          productName: { $ne: null }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]);

    const formattedTopProducts = {
      labels: topProductsData.map(p => {
        const productName = p.productName || 'Unknown Product';
        return productName.length > 20 ? productName.substring(0, 20) + '...' : productName;
      }),
      fullNames: topProductsData.map(p => p.productName || 'Unknown Product'),
      values: topProductsData.map(p => p.totalRevenue || 0),
      quantities: topProductsData.map(p => p.totalQuantity || 0),
      averagePrices: topProductsData.map(p => p.averagePrice || 0),
      orderCounts: topProductsData.map(p => p.orderCount || 0),
      productIds: topProductsData.map(p => p._id)
    };

    const categoryData = await Order.aggregate([
      {
        $match: orderFilter
      },
      { $unwind: "$orderedItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "productInfo.category",
          foreignField: "_id",
          as: "categoryInfo"
        }
      },
      { $unwind: { path: "$categoryInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$categoryInfo._id",
          categoryName: { $first: "$categoryInfo.name" },
          total: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
          quantity: { $sum: "$orderedItems.quantity" },
          productCount: { $addToSet: "$orderedItems.product" },
          orderCount: { $sum: 1 }
        }
      },
      {
        $addFields: {
          uniqueProductCount: { $size: "$productCount" }
        }
      },
      {
        $match: {
          _id: { $ne: null },
          categoryName: { $ne: null }
        }
      },
      { $sort: { total: -1 } }
    ]);

    const formattedCategoryData = {
      labels: categoryData.map(c => c.categoryName || 'Uncategorized'),
      values: categoryData.map(c => c.total || 0),
      quantities: categoryData.map(c => c.quantity || 0),
      productCounts: categoryData.map(c => c.uniqueProductCount || 0),
      orderCounts: categoryData.map(c => c.orderCount || 0),
      categoryIds: categoryData.map(c => c._id)
    };

    // Calculate total sales and period sales based on filtered data
    const totalSales = formattedPaymentData.values.reduce((a, b) => a + b, 0);
    const periodSales = revenueData.values.reduce((a, b) => a + b, 0);

    // Calculate filtered order count for stats
    const filteredOrderCount = await Order.countDocuments(orderFilter);

    // Pagination parameters
    const orderPage = parseInt(req.query.orderPage) || 1;
    const orderLimit = parseInt(req.query.orderLimit) || 5;
    const orderSkip = (orderPage - 1) * orderLimit;
    const productPage = parseInt(req.query.productPage) || 1;
    const productLimit = parseInt(req.query.productLimit) || 5;
    const productSkip = (productPage - 1) * productLimit;

    // Calculate total pages (will be updated after filtering)
    const totalProductPages = Math.ceil(productCount / productLimit);

    // Build query for recent orders with filters
    let orderQuery = {
      orderDate: { $gte: startDate, $lt: endDate }
    };

    // Add payment method filter
    if (paymentMethod !== 'all') {
      orderQuery.paymentMethod = paymentMethod;
    }

    // Add order status filter
    if (orderStatus !== 'all') {
      orderQuery['orderedItems.status'] = orderStatus;
    }

    // Get recent orders with pagination and filters
    const recentOrders = await Order.find(orderQuery)
      .populate("userId", "name email")
      .sort({ orderDate: -1 })
      .skip(orderSkip)
      .limit(orderLimit)
      .lean();

    // Calculate total pages for filtered orders
    const totalFilteredOrderPages = Math.ceil(filteredOrderCount / orderLimit);

    // Format orders for display
    const formattedOrders = recentOrders.map(order => {
      let overallStatus = "Processing";
      if (order.orderedItems && order.orderedItems.every(item => item.status === "Delivered")) {
        overallStatus = "Delivered";
      } else if (order.orderedItems && order.orderedItems.every(item => item.status === "Cancelled")) {
        overallStatus = "Cancelled";
      } else if (order.orderedItems && order.orderedItems.some(item => item.status === "Shipped")) {
        overallStatus = "Shipped";
      }

      return {
        _id: order._id,
        orderId: order.orderNumber || (order.orderId ? order.orderId.substring(0, 8) : 'N/A'),
        customer: order.userId ? order.userId.name : "Unknown",
        date: moment(order.orderDate).format("MMM DD, YYYY"),
        amount: `₹${order.finalAmount.toFixed(2)}`,
        status: overallStatus
      };
    });

    // Get latest products with pagination
    const latestProducts = await Product.find()
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .skip(productSkip)
      .limit(productLimit)
      .lean();

    // Format products for display
    const formattedProducts = latestProducts.map(product => ({
      _id: product._id,
      productId: product._id.toString().substring(0, 8),
      name: product.productName,
      category: product.category ? product.category.name : "Uncategorized",
      price: `₹${product.price.toFixed(2)}`,
      stock: product.quantity
    }));

    // Get top reviewed products
    const topReviewedProducts = await getTopReviewedProducts();

    // Format filter dates for display
    const formatDate = (date) => {
      return date.toISOString().split('T')[0];
    };

    // Render dashboard with all data
    res.render("admin/dashboard", {
      activePage: 'dashboard',
      currentPeriod: period,
      month: month, // Pass the selected month to the view
      filters: {
        startDate: req.query.startDate || formatDate(startDate),
        endDate: req.query.endDate || formatDate(endDate),
        paymentMethod: paymentMethod,
        orderStatus: orderStatus,
        sortBy: sortBy,
        sortOrder: sortOrder
      },
      stats: {
        userCount,
        productCount,
        orderCount: filteredOrderCount, // Use filtered count
        categoryCount,
        totalSales,
        periodSales: periodSales // Use calculated period sales
      },
      revenueData,
      paymentMethodsData: formattedPaymentData,
      topProductsData: formattedTopProducts,
      categoryData: formattedCategoryData,
      recentOrders: formattedOrders,
      latestProducts: formattedProducts,
      topReviewedProducts: topReviewedProducts,
      pagination: {
        orders: {
          currentPage: orderPage,
          totalPages: totalFilteredOrderPages,
          limit: orderLimit,
          totalItems: filteredOrderCount
        },
        products: {
          currentPage: productPage,
          totalPages: totalProductPages,
          limit: productLimit,
          totalItems: productCount
        }
      }
    });
  } catch (error) {
    // Provide empty data structures to prevent undefined errors
    res.render("admin/dashboard", {
      activePage: 'dashboard',
      currentPeriod: req.query.period || 'month',
      error: "Failed to load dashboard data: " + error.message,
      filters: {
        startDate: req.query.startDate || '',
        endDate: req.query.endDate || '',
        paymentMethod: req.query.paymentMethod || 'all',
        orderStatus: req.query.orderStatus || 'all',
        sortBy: req.query.sortBy || 'date',
        sortOrder: req.query.sortOrder || 'desc'
      },
      stats: {
        userCount: 0,
        productCount: 0,
        orderCount: 0,
        categoryCount: 0,
        totalSales: 0,
        monthlySales: 0
      },
      recentOrders: [],
      latestProducts: [],
      topReviewedProducts: [],
      pagination: {
        orders: {
          currentPage: 1,
          totalPages: 1,
          limit: 5,
          totalItems: 0
        },
        products: {
          currentPage: 1,
          totalPages: 1,
          limit: 5,
          totalItems: 0
        }
      },
      revenueData: {
        labels: [],
        values: []
      },
      paymentMethodsData: {
        labels: [],
        values: []
      },
      topProductsData: {
        labels: [],
        values: []
      },
      categoryData: {
        labels: [],
        values: []
      }
    });
  }
}


//=================================================================================================
// Get Dashboard Orders
//=================================================================================================
// This function gets the orders with pagination.
// It displays the orders in the dashboard.
//=================================================================================================
const getDashboardOrders = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
    }

    const orderPage = parseInt(req.query.page) || 1;
    const orderLimit = parseInt(req.query.limit) || 5;
    const orderSkip = (orderPage - 1) * orderLimit;

    // Get filter parameters from query
    const period = req.query.period || 'month';
    const month = req.query.month; // For specific month selection (format: YYYY-MM)
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';

    // Date range handling (same logic as main dashboard)
    const currentDate = new Date();
    let startDate, endDate;

    if (req.query.startDate && req.query.endDate) {
      startDate = new Date(req.query.startDate);
      endDate = new Date(req.query.endDate);
      endDate.setHours(23, 59, 59, 999);
    } else {
      switch(period) {
        case 'today':
          startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
          endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1);
          break;
        case 'week':
          startDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          endDate = currentDate;
          break;
        case 'year':
          startDate = new Date(currentDate.getFullYear(), 0, 1);
          endDate = new Date(currentDate.getFullYear() + 1, 0, 1);
          break;
        case 'month':
        default:
          if (month) {
            // Handle specific month selection (format: YYYY-MM)
            const [year, monthNum] = month.split('-');
            const selectedYear = parseInt(year);
            const selectedMonth = parseInt(monthNum) - 1; // JavaScript months are 0-indexed

            startDate = new Date(selectedYear, selectedMonth, 1);

            // Check if it's the current month
            const now = new Date();
            const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

            if (isCurrentMonth) {
              // For current month, end date is current date
              endDate = new Date();
              endDate.setHours(23, 59, 59, 999);
            } else {
              // For past months, end date is the last day of that month
              endDate = new Date(selectedYear, selectedMonth + 1, 1);
            }
          } else {
            // Default to current month
            startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            // For current month, end date should be current date if it's the current month
            // For past months, end date should be the last day of that month
            const isCurrentMonth = currentDate.getFullYear() === new Date().getFullYear() &&
                                   currentDate.getMonth() === new Date().getMonth();
            if (isCurrentMonth) {
              endDate = new Date(); // Current date and time
              endDate.setHours(23, 59, 59, 999); // End of current day
            } else {
              endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            }
          }
          break;
      }
    }

    // Build query with filters
    let orderQuery = {
      orderDate: { $gte: startDate, $lt: endDate }
    };

    if (paymentMethod !== 'all') {
      orderQuery.paymentMethod = paymentMethod;
    }

    if (orderStatus !== 'all') {
      orderQuery['orderedItems.status'] = orderStatus;
    }

    // Get total count for pagination
    const orderCount = await Order.countDocuments(orderQuery);
    const totalOrderPages = Math.ceil(orderCount / orderLimit);

    // Get recent orders with pagination and filters
    const recentOrders = await Order.find(orderQuery)
      .populate("userId", "name email")
      .sort({ orderDate: -1 })
      .skip(orderSkip)
      .limit(orderLimit)
      .lean();

    // Format orders for display
    const formattedOrders = recentOrders.map(order => {
      let overallStatus = "Processing";
      if (order.orderedItems && order.orderedItems.every(item => item.status === "Delivered")) {
        overallStatus = "Delivered";
      } else if (order.orderedItems && order.orderedItems.every(item => item.status === "Cancelled")) {
        overallStatus = "Cancelled";
      } else if (order.orderedItems && order.orderedItems.some(item => item.status === "Shipped")) {
        overallStatus = "Shipped";
      }

      return {
        _id: order._id,
        orderId: order.orderNumber || `MK${order._id.toString().slice(-5)}`,
        customer: order.userId ? order.userId.name : "Unknown",
        date: moment(order.orderDate).format("MMM DD, YYYY"),
        amount: `₹${Math.round(order.orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0) + (order.shippingCharge || 0) + (order.taxAmount || 0) - (order.discount || 0))}`,
        status: overallStatus
      };
    });

    res.json({
      success: true,
      orders: formattedOrders,
      pagination: {
        currentPage: orderPage,
        totalPages: totalOrderPages,
        limit: orderLimit,
        totalItems: orderCount
      }
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch orders' });
  }
};
//=================================================================================================
// Get Dashboard Products
//=================================================================================================
// This function gets the latest products with pagination.
// It displays the latest products in the dashboard.
//=================================================================================================
const getDashboardProducts = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
    }

    const productPage = parseInt(req.query.page) || 1;
    const productLimit = parseInt(req.query.limit) || 5;
    const productSkip = (productPage - 1) * productLimit;

    // Get total count for pagination
    const productCount = await Product.countDocuments();
    const totalProductPages = Math.ceil(productCount / productLimit);

    // Get latest products with pagination
    const latestProducts = await Product.find()
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .skip(productSkip)
      .limit(productLimit)
      .lean();

    // Format products for display
    const formattedProducts = latestProducts.map(product => ({
      _id: product._id,
      productId: product._id.toString().substring(0, 8),
      name: product.productName,
      category: product.category ? product.category.name : "Uncategorized",
      price: `₹${product.price.toFixed(2)}`,
      stock: product.quantity
    }));

    res.json({
      success: true,
      products: formattedProducts,
      pagination: {
        currentPage: productPage,
        totalPages: totalProductPages,
        limit: productLimit,
        totalItems: productCount
      }
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch products' });
  }
};

const logout = (req,res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
}

const pageerror = (req, res) => res.render("admin-error");

module.exports = { loadLogin, login, loadDashboard, getDashboardOrders, getDashboardProducts, logout, pageerror };