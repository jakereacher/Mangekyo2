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

    // Pagination parameters for orders
    const orderPage = parseInt(req.query.orderPage) || 1;
    const orderLimit = parseInt(req.query.orderLimit) || 5;
    const orderSkip = (orderPage - 1) * orderLimit;

    // Get total order count for pagination
    const totalOrders = await Order.countDocuments();
    const totalOrderPages = Math.ceil(totalOrders / orderLimit);

    // Get recent orders with pagination
    const recentOrders = await Order.find()
      .populate("userId", "name email")
      .sort({ orderDate: -1 })
      .skip(orderSkip)
      .limit(orderLimit)
      .lean();

    // Format orders for display
    const formattedOrders = recentOrders.map(order => {
      // Determine overall order status
      let overallStatus = "Processing";
      if (order.orderedItems.every(item => item.status === "Delivered")) {
        overallStatus = "Delivered";
      } else if (order.orderedItems.every(item => item.status === "Cancelled")) {
        overallStatus = "Cancelled";
      } else if (order.orderedItems.some(item => item.status === "Shipped")) {
        overallStatus = "Shipped";
      }

      return {
        _id: order._id,
        orderId: order.orderNumber || order.orderId.substring(0, 8),
        customer: order.userId ? order.userId.name : "Unknown",
        date: moment(order.orderDate).format("MMM DD, YYYY"),
        amount: `₹${order.finalAmount.toFixed(2)}`,
        status: overallStatus
      };
    });

    // Pagination parameters for products
    const productPage = parseInt(req.query.productPage) || 1;
    const productLimit = parseInt(req.query.productLimit) || 5;
    const productSkip = (productPage - 1) * productLimit;

    // Get total product count for pagination
    const totalProductPages = Math.ceil(productCount / productLimit);

    // Get latest products with pagination
    const latestProducts = await Product.find()
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .skip(productSkip)
      .limit(productLimit)
      .lean();

    // Format products for display
    const formattedProducts = latestProducts.map(product => {
      return {
        _id: product._id,
        productId: product._id.toString().substring(0, 8),
        name: product.productName,
        category: product.category ? product.category.name : "Uncategorized",
        price: `₹${product.price.toFixed(2)}`,
        stock: product.quantity
      };
    });

    // Get sales summary
    const salesSummary = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: new Date(new Date().setDate(new Date().getDate() - 30)) }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$finalAmount" },
          totalOrders: { $sum: 1 }
        }
      }
    ]);

    const totalSales = salesSummary.length > 0 ? salesSummary[0].totalSales : 0;
    const monthlySales = totalSales;

    // Render dashboard with real data and pagination
    res.render("dashboard", {
      isDemoAdmin: req.session.isDemoAdmin || false,
      stats: {
        userCount,
        productCount,
        orderCount,
        categoryCount,
        totalSales,
        monthlySales
      },
      recentOrders: formattedOrders,
      latestProducts: formattedProducts,
      pagination: {
        orders: {
          currentPage: orderPage,
          totalPages: totalOrderPages,
          limit: orderLimit,
          totalItems: totalOrders
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
    res.render("dashboard", {
      isDemoAdmin: req.session.isDemoAdmin || false,
      error: "Failed to load dashboard data"
    });
  }
}

const logout = (req,res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
}

const pageerror = (req,res) => res.render("admin-error");

module.exports = { loadLogin, login, loadDashboard, logout, pageerror };