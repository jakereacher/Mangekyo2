/**
 * Admin Controller
 * Handles admin authentication and dashboard functionality
 */

const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');

const DEMO_ADMIN = {
  email: "demo_admin@example.com",
  password: "$2b$10$9mX.3dR7fGp5YQ6d8lzZpeY0YRfJQ9b3m8X1uD0vLk9rKs6VJ5XaC",
  name: "Demo Admin",
  isAdmin: true,
  isDemo: true,
  _id: new mongoose.Types.ObjectId("6478a3b18bd2a6d999999992")
};

const loadLogin = (req,res) => {
  if(req.session.admin) return res.redirect("/admin/dashboard");
  res.render("admin-login", { message: null });
}

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
    console.error('Login error:', error);
    res.render('admin-login', { message: 'Login failed' });
  }
};

const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

const moment = require("moment");

const loadDashboard = async(req, res) => {
  try {
    if(!req.session.admin) return res.redirect("/admin/login");

    // Get counts
    const userCount = await User.countDocuments({ isAdmin: false });
    const productCount = await Product.countDocuments();
    const orderCount = await Order.countDocuments();
    const categoryCount = await Category.countDocuments();

    // Get filter period from query params
    const period = req.query.period || 'month';
    const currentDate = new Date();
    let startDate, endDate, dateFormat, groupFormat, labelFormat;

    // Set date ranges and formatting based on period
    switch(period) {
      case 'today':
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1);
        dateFormat = "%Y-%m-%d-%H";
        groupFormat = { year: { $year: "$orderDate" }, month: { $month: "$orderDate" }, day: { $dayOfMonth: "$orderDate" }, hour: { $hour: "$orderDate" } };
        labelFormat = 'HH:mm';
        break;
      case 'week':
        startDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = currentDate;
        dateFormat = "%Y-%m-%d";
        groupFormat = { year: { $year: "$orderDate" }, month: { $month: "$orderDate" }, day: { $dayOfMonth: "$orderDate" } };
        labelFormat = 'MMM DD';
        break;
      case 'year':
        startDate = new Date(currentDate.getFullYear(), 0, 1);
        endDate = new Date(currentDate.getFullYear() + 1, 0, 1);
        dateFormat = "%Y-%m";
        groupFormat = { year: { $year: "$orderDate" }, month: { $month: "$orderDate" } };
        labelFormat = 'MMM YYYY';
        break;
      case 'month':
      default:
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        dateFormat = "%Y-%m-%d";
        groupFormat = { year: { $year: "$orderDate" }, month: { $month: "$orderDate" }, day: { $dayOfMonth: "$orderDate" } };
        labelFormat = 'MMM DD';
        break;
    }

    // Get revenue trend data with filtering
    const revenueByPeriod = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: groupFormat,
          revenue: { $sum: "$finalAmount" },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1 }
      }
    ]);

    // Format revenue trend data
    const revenueData = {
      labels: [],
      values: [],
      period: period
    };

    // Generate all time periods and fill in data
    if (period === 'today') {
      for (let i = 0; i < 24; i++) {
        const hour = i;
        const hourData = revenueByPeriod.find(d => d._id.hour === hour);
        revenueData.labels.push(`${hour.toString().padStart(2, '0')}:00`);
        revenueData.values.push(hourData ? hourData.revenue : 0);
      }
    } else if (period === 'week') {
      for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dayData = revenueByPeriod.find(d =>
          d._id.year === date.getFullYear() &&
          d._id.month === date.getMonth() + 1 &&
          d._id.day === date.getDate()
        );
        revenueData.labels.push(moment(date).format('MMM DD'));
        revenueData.values.push(dayData ? dayData.revenue : 0);
      }
    } else if (period === 'year') {
      for (let i = 0; i < 12; i++) {
        const month = i + 1;
        const monthData = revenueByPeriod.find(d => d._id.month === month);
        revenueData.labels.push(moment().month(i).format('MMM'));
        revenueData.values.push(monthData ? monthData.revenue : 0);
      }
    } else { // month
      const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const dayData = revenueByPeriod.find(d => d._id.day === i);
        revenueData.labels.push(i.toString());
        revenueData.values.push(dayData ? dayData.revenue : 0);
      }
    }

    // Get payment methods distribution (filtered by period)
    const paymentMethodsData = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: startDate, $lt: endDate }
        }
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

    // Debug: Check if there are any orders in the selected period
    const totalOrdersInPeriod = await Order.countDocuments({
      orderDate: { $gte: startDate, $lt: endDate }
    });
    console.log(`Total orders in period (${period}):`, totalOrdersInPeriod);
    console.log('Date range:', { startDate, endDate });

    // Also check total orders in database
    const totalOrdersInDB = await Order.countDocuments();
    console.log('Total orders in database:', totalOrdersInDB);

    // Get top products data (filtered by period) with proper product names
    const topProductsData = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: startDate, $lt: endDate }
        }
      },
      { $unwind: "$orderedItems" },
      // Temporarily remove status filter to see if that's the issue
      // {
      //   $match: {
      //     "orderedItems.status": { $ne: "Cancelled" }
      //   }
      // },
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

    console.log('Top Products Data:', topProductsData);
    console.log('Number of products found:', topProductsData.length);

    // If no products found, try a simpler query to debug
    if (topProductsData.length === 0) {
      console.log('No products found, trying simpler query...');
      const simpleOrderCheck = await Order.find({
        orderDate: { $gte: startDate, $lt: endDate }
      }).limit(1);
      console.log('Sample order found:', simpleOrderCheck.length > 0 ? 'Yes' : 'No');

      if (simpleOrderCheck.length > 0) {
        console.log('Sample order structure:', JSON.stringify(simpleOrderCheck[0], null, 2));
      }
    }

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

    // Get sales by category (filtered by period) with proper category names
    const categoryData = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: startDate, $lt: endDate }
        }
      },
      { $unwind: "$orderedItems" },
      // Temporarily remove status filter to see if that's the issue
      // {
      //   $match: {
      //     "orderedItems.status": { $ne: "Cancelled" }
      //   }
      // },
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

    console.log('Category Data:', categoryData);
    console.log('Number of categories found:', categoryData.length);

    const formattedCategoryData = {
      labels: categoryData.map(c => c.categoryName || 'Uncategorized'),
      values: categoryData.map(c => c.total || 0),
      quantities: categoryData.map(c => c.quantity || 0),
      productCounts: categoryData.map(c => c.uniqueProductCount || 0),
      orderCounts: categoryData.map(c => c.orderCount || 0),
      categoryIds: categoryData.map(c => c._id)
    };

    // Calculate total sales and monthly sales
    const totalSales = formattedPaymentData.values.reduce((a, b) => a + b, 0);
    const monthlySales = revenueData.values.reduce((a, b) => a + b, 0);

    // Pagination parameters
    const orderPage = parseInt(req.query.orderPage) || 1;
    const orderLimit = parseInt(req.query.orderLimit) || 5;
    const orderSkip = (orderPage - 1) * orderLimit;
    const productPage = parseInt(req.query.productPage) || 1;
    const productLimit = parseInt(req.query.productLimit) || 5;
    const productSkip = (productPage - 1) * productLimit;

    // Calculate total pages
    const totalOrderPages = Math.ceil(orderCount / orderLimit);
    const totalProductPages = Math.ceil(productCount / productLimit);

    // Get recent orders with pagination
    const recentOrders = await Order.find()
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

    // Render dashboard with all data
    res.render("dashboard", {
      isDemoAdmin: req.session.isDemoAdmin || false,
      currentPeriod: period,
      stats: {
        userCount,
        productCount,
        orderCount,
        categoryCount,
        totalSales,
        periodSales: monthlySales
      },
      revenueData,
      paymentMethodsData: formattedPaymentData,
      topProductsData: formattedTopProducts,
      categoryData: formattedCategoryData,
      recentOrders: formattedOrders,
      latestProducts: formattedProducts,
      pagination: {
        orders: {
          currentPage: orderPage,
          totalPages: totalOrderPages,
          limit: orderLimit,
          totalItems: orderCount
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
    console.error("Dashboard error:", error);
    // Provide empty data structures to prevent undefined errors
    res.render("dashboard", {
      isDemoAdmin: req.session.isDemoAdmin || false,
      error: "Failed to load dashboard data: " + error.message,
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

const logout = (req,res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
}

const pageerror = (req,res) => res.render("admin-error");

module.exports = { loadLogin, login, loadDashboard, logout, pageerror };