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
    console.log("Generating sales report...");
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    // Get filter parameters
    const filter = req.query.filter || 'custom';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const sortBy = req.query.sortBy || 'date';
    const sortOrder = req.query.sortOrder || 'desc';
    const productsSortBy = req.query.productsSortBy || 'revenue';
    const productsSortOrder = req.query.productsSortOrder || 'desc';

    // Pagination parameters for orders
    const page = Math.max(parseInt(req.query.page) || 1, 1); // Ensure page is at least 1
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Pagination parameters for top products
    const productsPage = Math.max(parseInt(req.query.productsPage) || 1, 1);
    const productsLimit = parseInt(req.query.productsLimit) || 5;
    const productsSkip = (productsPage - 1) * productsLimit;

    // Date filtering logic
    let startDate, endDate;
    const now = new Date();

    if (filter === 'today') {
      startDate = moment().startOf('day').toDate();
      endDate = moment().endOf('day').toDate();
    } else if (filter === 'this_week') {
      startDate = moment().startOf('week').toDate();
      endDate = moment().endOf('week').toDate();
    } else if (filter === 'this_month') {
      startDate = moment().startOf('month').toDate();
      endDate = moment().endOf('month').toDate();
    } else if (filter === 'this_year') {
      startDate = moment().startOf('year').toDate();
      endDate = moment().endOf('year').toDate();
    } else if (filter === 'all_time') {
      startDate = new Date(0); // Beginning of time
      endDate = moment().endOf('day').toDate();
    } else if (filter === 'custom') {
      try {
        startDate = req.query.startDate
          ? moment(req.query.startDate).startOf('day').toDate()
          : moment().subtract(30, 'days').startOf('day').toDate();

        endDate = req.query.endDate
          ? moment(req.query.endDate).endOf('day').toDate()
          : moment().endOf('day').toDate();

        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid date format");
        }
      } catch (error) {
        console.error("Date parsing error:", error);
        startDate = moment().subtract(30, 'days').startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
      }
    }

    console.log(`Filters: filter=${filter}, startDate=${startDate}, endDate=${endDate}, paymentMethod=${paymentMethod}, orderStatus=${orderStatus}`);
    console.log(`Pagination: page=${page}, limit=${limit}, skip=${skip}`);
    console.log(`Sorting: sortBy=${sortBy}, sortOrder=${sortOrder}`);

    // Build match stage for aggregation
    let matchStage = { orderDate: { $gte: startDate, $lte: endDate } };

    if (paymentMethod !== 'all') {
      matchStage.paymentMethod = paymentMethod;
    }

    // Define aggregation pipelines
    const ordersPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      ...(orderStatus !== 'all' ? [{ $match: { "orderedItems.status": orderStatus } }] : []),
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$_id",
          orderId: { $first: "$orderId" },
          orderNumber: { $first: "$orderNumber" }, // Include orderNumber field
          orderDate: { $first: "$orderDate" },
          userId: { $first: "$userId" },
          userName: { $first: "$userDetails.name" },
          userEmail: { $first: "$userDetails.email" },
          paymentMethod: { $first: "$paymentMethod" },
          paymentStatus: { $first: "$paymentStatus" },
          finalAmount: { $first: "$finalAmount" },
          discount: { $first: "$discount" },
          shippingCharge: { $first: "$shippingCharge" },
          items: { $push: "$orderedItems" },
          products: { $push: "$productDetails" },
          itemCount: { $sum: 1 }
        }
      },
      {
        $addFields: {
          totalDiscount: {
            $sum: {
              $map: {
                input: { $zip: { inputs: ["$items", "$products"] } },
                as: "item",
                in: {
                  $multiply: [
                    { $arrayElemAt: ["$$item.0.quantity", 0] },
                    {
                      $subtract: [
                        { $ifNull: [{ $arrayElemAt: ["$$item.1.price", 0] }, 0] },
                        { $ifNull: [{ $arrayElemAt: ["$$item.0.price", 0] }, 0] }
                      ]
                    }
                  ]
                }
              }
            }
          }
        }
      },
      { $sort: sortBy === 'amount' ? { finalAmount: sortOrder === 'asc' ? 1 : -1 } : { orderDate: sortOrder === 'asc' ? 1 : -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    const countPipeline = [
      { $match: matchStage },
      ...(orderStatus !== 'all' ? [
        { $unwind: "$orderedItems" },
        { $match: { "orderedItems.status": orderStatus } },
        { $group: { _id: "$_id" } }
      ] : []),
      { $count: "total" }
    ];

    const summaryPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      ...(orderStatus !== 'all' ? [{ $match: { "orderedItems.status": orderStatus } }] : []),
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalOrders: { $addToSet: "$_id" },
          totalSales: { $sum: "$finalAmount" },
          totalProducts: { $sum: "$orderedItems.quantity" },
          totalDiscount: {
            $sum: {
              $multiply: [
                "$orderedItems.quantity",
                {
                  $subtract: [
                    { $ifNull: ["$productDetails.price", 0] },
                    { $ifNull: ["$orderedItems.price", 0] }
                  ]
                }
              ]
            }
          },
          minOrderValue: { $min: "$finalAmount" },
          maxOrderValue: { $max: "$finalAmount" }
        }
      },
      {
        $project: {
          _id: 0,
          totalOrders: { $size: "$totalOrders" },
          totalSales: 1,
          totalProducts: 1,
          totalDiscount: 1,
          minOrderValue: 1,
          maxOrderValue: 1,
          avgOrderValue: { $divide: ["$totalSales", { $size: "$totalOrders" }] },
          totalOriginalValue: { $add: ["$totalSales", "$totalDiscount"] },
          discountPercentage: {
            $multiply: [
              {
                $divide: [
                  "$totalDiscount",
                  { $add: ["$totalSales", "$totalDiscount"] }
                ]
              },
              100
            ]
          }
        }
      }
    ];

    // Payment method distribution pipeline
    const paymentMethodPipeline = [
      { $match: matchStage },
      ...(orderStatus !== 'all' ? [
        { $unwind: "$orderedItems" },
        { $match: { "orderedItems.status": orderStatus } },
        { $group: { _id: "$_id", paymentMethod: { $first: "$paymentMethod" }, finalAmount: { $first: "$finalAmount" } } }
      ] : []),
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          total: { $sum: "$finalAmount" }
        }
      }
    ];

    // Top products pipeline
    const topProductsPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      ...(orderStatus !== 'all' ? [{ $match: { "orderedItems.status": orderStatus } }] : []),
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
      // Add lookup for category information
      {
        $lookup: {
          from: "categories",
          localField: "productDetails.category",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$orderedItems.product",
          name: { $first: "$productDetails.productName" },
          image: { $first: { $arrayElemAt: ["$productDetails.productImage", 0] } },
          brand: { $first: "$productDetails.brand" },
          category: { $first: "$categoryDetails.name" },
          quantity: { $sum: "$orderedItems.quantity" },
          revenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
          originalPrice: { $first: "$productDetails.price" },
          offerPercentage: { $first: "$productDetails.offerPercentage" },
          offerType: { $first: "$productDetails.offerType" },
          discountPercentage: { $first: "$orderedItems.discountPercentage" },
          // Calculate original revenue based on product's original price
          originalRevenue: {
            $sum: {
              $multiply: [
                "$orderedItems.quantity",
                { $ifNull: ["$productDetails.price", 0] }
              ]
            }
          },
          totalDiscount: {
            $sum: {
              $multiply: [
                "$orderedItems.quantity",
                {
                  $subtract: [
                    { $ifNull: ["$productDetails.price", 0] },
                    { $ifNull: ["$orderedItems.price", 0] }
                  ]
                }
              ]
            }
          }
        }
      },
      {
        $sort: {
          [productsSortBy === 'quantity' ? 'quantity' :
           productsSortBy === 'discount' ? 'totalDiscount' :
           productsSortBy === 'original' ? 'originalRevenue' : 'revenue']:
           productsSortOrder === 'asc' ? 1 : -1
        }
      },
      { $skip: productsSkip },
      { $limit: productsLimit }
    ];

    // Top products count pipeline for pagination
    const topProductsCountPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      ...(orderStatus !== 'all' ? [{ $match: { "orderedItems.status": orderStatus } }] : []),
      {
        $group: {
          _id: "$orderedItems.product"
        }
      },
      { $count: "total" }
    ];

    // Status distribution pipeline
    const statusDistributionPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      {
        $group: {
          _id: "$orderedItems.status",
          count: { $sum: 1 },
          revenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } }
        }
      },
      { $sort: { count: -1 } }
    ];

    // Execute all aggregations in parallel
    const [orders, countResult, summaryResult, paymentMethodData, topProducts, topProductsCountResult, statusDistribution] = await Promise.all([
      Order.aggregate(ordersPipeline),
      Order.aggregate(countPipeline),
      Order.aggregate(summaryPipeline),
      Order.aggregate(paymentMethodPipeline),
      Order.aggregate(topProductsPipeline),
      Order.aggregate(topProductsCountPipeline),
      Order.aggregate(statusDistributionPipeline)
    ]);

    // Process summary data
    const summary = summaryResult[0] || {
      totalOrders: 0,
      totalSales: 0,
      totalProducts: 0,
      totalDiscount: 0,
      avgOrderValue: 0,
      minOrderValue: 0,
      maxOrderValue: 0,
      totalOriginalValue: 0,
      discountPercentage: 0
    };

    // Process payment method data
    const paymentSummary = {
      cod: { count: 0, total: 0, avg: 0 },
      razorpay: { count: 0, total: 0, avg: 0 },
      wallet: { count: 0, total: 0, avg: 0 }
    };

    paymentMethodData.forEach(item => {
      if (item._id && paymentSummary[item._id]) {
        paymentSummary[item._id] = {
          count: item.count,
          total: item.total,
          avg: item.count > 0 ? item.total / item.count : 0
        };
      }
    });

    // Format orders for display
    const formattedOrders = orders.map(order => {
      // Format ordered items
      const orderedItems = order.items.map((item, index) => {
        const productDetail = order.products[index];

        return {
          ...item,
          productName: productDetail ? productDetail.productName : 'Unknown Product',
          productImage: productDetail && productDetail.productImage ? productDetail.productImage[0] : null,
          originalPrice: productDetail ? productDetail.price : 0,
          discountPerItem: productDetail ? (productDetail.price - item.price) : 0,
          offerPercentage: productDetail ? productDetail.offerPercentage || 0 : 0
        };
      });

      // Use orderNumber if available, otherwise use a shortened version of the ID (5 digits)
      const displayOrderId = order.orderNumber || `MK${order._id.toString().slice(-5)}`;

      return {
        _id: order._id,
        orderId: order.orderId || order._id.toString().slice(-5).toUpperCase(),
        orderNumber: order.orderNumber, // Include the order number for display
        displayOrderId: displayOrderId, // Add a display-friendly order ID
        orderDate: order.orderDate,
        formattedOrderDate: moment(order.orderDate).format('YYYY-MM-DD HH:mm'),
        customerName: order.userName || 'Unknown',
        customerEmail: order.userEmail || 'Unknown',
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        finalAmount: order.finalAmount,
        discount: order.discount || 0,
        shippingCharge: order.shippingCharge || 0,
        totalDiscount: order.totalDiscount || 0,
        discountPercentage: order.finalAmount > 0 ? Math.round((order.totalDiscount / (order.finalAmount + order.totalDiscount)) * 100) : 0,
        itemCount: order.itemCount || 0,
        orderedItems: orderedItems
      };
    });

    // Get pagination data for orders
    const totalItems = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalItems / limit);

    // Get pagination data for top products
    const totalProductItems = topProductsCountResult.length > 0 ? topProductsCountResult[0].total : 0;
    const totalProductPages = Math.ceil(totalProductItems / productsLimit);

    // Format status distribution data
    const formattedStatusDistribution = statusDistribution.map(status => ({
      status: status._id || 'Unknown',
      count: status.count,
      revenue: status.revenue
    }));

    // Prepare sales by date data for chart
    const salesByDateMap = {};
    const dateFormat = 'YYYY-MM-DD';

    // Initialize with all dates in the range
    let currentDate = moment(startDate);
    const endMoment = moment(endDate);

    while (currentDate.isSameOrBefore(endMoment)) {
      const dateKey = currentDate.format(dateFormat);
      salesByDateMap[dateKey] = 0;
      currentDate.add(1, 'days');
    }

    // Fill in actual sales data
    orders.forEach(order => {
      const orderDate = moment(order.orderDate).format(dateFormat);
      if (salesByDateMap[orderDate] !== undefined) {
        salesByDateMap[orderDate] += order.finalAmount || 0;
      }
    });

    // Prepare payment method data for chart
    const salesByPaymentMethod = {
      cod: 0,
      razorpay: 0,
      wallet: 0
    };

    // Fill in payment method data
    Object.keys(paymentSummary).forEach(method => {
      if (salesByPaymentMethod[method] !== undefined) {
        salesByPaymentMethod[method] = paymentSummary[method].total || 0;
      }
    });

    // Calculate offer summary data
    const offerSummary = {
      productOffers: { count: 0, savings: 0 },
      categoryOffers: { count: 0, savings: 0 },
      coupons: { count: 0, savings: 0 },
      totalSavings: summary.totalDiscount || 0
    };

    // Count products with offers by type
    topProducts.forEach(product => {
      if (product.offerPercentage > 0) {
        if (product.offerType === 'product') {
          offerSummary.productOffers.count++;
          offerSummary.productOffers.savings += product.totalDiscount || 0;
        } else if (product.offerType === 'category') {
          offerSummary.categoryOffers.count++;
          offerSummary.categoryOffers.savings += product.totalDiscount || 0;
        }
      }
    });

    // Count coupon usage and calculate savings
    orders.forEach(order => {
      if (order.couponApplied && order.coupon) {
        offerSummary.coupons.count++;
        // Calculate approximate coupon savings
        if (order.discount > 0) {
          offerSummary.coupons.savings += order.discount;
        }
      }
    });

    // Make sure total savings is the sum of all savings types
    offerSummary.totalSavings =
      offerSummary.productOffers.savings +
      offerSummary.categoryOffers.savings +
      offerSummary.coupons.savings;

    // Prepare data for rendering
    const renderData = {
      orders: formattedOrders,
      summary,
      paymentSummary,
      topProducts,
      offerSummary,
      statusDistribution: formattedStatusDistribution,
      totalSales: summary.totalSales || 0,
      totalOrders: summary.totalOrders || 0,
      totalProducts: summary.totalProducts || 0,
      salesByDate: JSON.stringify(salesByDateMap),
      salesByPaymentMethod,
      filters: {
        filter,
        startDate: moment(startDate).format('YYYY-MM-DD'),
        endDate: moment(endDate).format('YYYY-MM-DD'),
        paymentMethod,
        orderStatus,
        sortBy,
        sortOrder,
        productsSortBy,
        productsSortOrder
      },
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      productsPagination: {
        page: productsPage,
        limit: productsLimit,
        totalItems: totalProductItems,
        totalPages: totalProductPages,
        hasNextPage: productsPage < totalProductPages,
        hasPrevPage: productsPage > 1
      },
      activePage: "reports",
      isAjaxRequest: req.xhr || (req.headers['x-requested-with'] === 'XMLHttpRequest')
    };

    // Check if this is an AJAX request
    if (renderData.isAjaxRequest) {
      // For AJAX requests, render the page normally
      // The client-side JS will extract only the needed parts
      res.render("admin/admin-sales-report", renderData);
    } else {
      // For regular requests, render the full page
      res.render("admin/admin-sales-report", renderData);
    }
  } catch (error) {
    console.error("Error generating sales report:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/admin-error", {
      message: "Failed to generate sales report",
      activePage: "reports"
    });
  }
};

// AJAX endpoint for sales report orders pagination
exports.getSalesReportOrders = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get filter parameters
    const filter = req.query.filter || 'custom';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const sortBy = req.query.sortBy || 'date';
    const sortOrder = req.query.sortOrder || 'desc';

    // Pagination parameters for orders
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Date filtering logic
    let startDate, endDate;
    if (filter === 'today') {
      startDate = moment().startOf('day').toDate();
      endDate = moment().endOf('day').toDate();
    } else if (filter === 'this_week') {
      startDate = moment().startOf('week').toDate();
      endDate = moment().endOf('week').toDate();
    } else if (filter === 'this_month') {
      startDate = moment().startOf('month').toDate();
      endDate = moment().endOf('month').toDate();
    } else if (filter === 'this_year') {
      startDate = moment().startOf('year').toDate();
      endDate = moment().endOf('year').toDate();
    } else if (filter === 'all_time') {
      startDate = new Date(0);
      endDate = moment().endOf('day').toDate();
    } else if (filter === 'custom') {
      try {
        startDate = req.query.startDate
          ? moment(req.query.startDate).startOf('day').toDate()
          : moment().subtract(30, 'days').startOf('day').toDate();
        endDate = req.query.endDate
          ? moment(req.query.endDate).endOf('day').toDate()
          : moment().endOf('day').toDate();
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid date format");
        }
      } catch (error) {
        startDate = moment().subtract(30, 'days').startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
      }
    }

    // Build match stage for aggregation
    let matchStage = { orderDate: { $gte: startDate, $lte: endDate } };
    if (paymentMethod !== 'all') {
      matchStage.paymentMethod = paymentMethod;
    }

    // Orders pipeline
    const ordersPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      ...(orderStatus !== 'all' ? [{ $match: { "orderedItems.status": orderStatus } }] : []),
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$_id",
          orderId: { $first: "$orderId" },
          orderNumber: { $first: "$orderNumber" },
          orderDate: { $first: "$orderDate" },
          userId: { $first: "$userId" },
          userName: { $first: "$userDetails.name" },
          userEmail: { $first: "$userDetails.email" },
          paymentMethod: { $first: "$paymentMethod" },
          paymentStatus: { $first: "$paymentStatus" },
          finalAmount: { $first: "$finalAmount" },
          discount: { $first: "$discount" },
          shippingCharge: { $first: "$shippingCharge" },
          items: { $push: "$orderedItems" },
          products: { $push: "$productDetails" },
          itemCount: { $sum: 1 }
        }
      },
      {
        $addFields: {
          totalDiscount: {
            $sum: {
              $map: {
                input: { $zip: { inputs: ["$items", "$products"] } },
                as: "item",
                in: {
                  $multiply: [
                    { $arrayElemAt: ["$$item.0.quantity", 0] },
                    {
                      $subtract: [
                        { $ifNull: [{ $arrayElemAt: ["$$item.1.price", 0] }, 0] },
                        { $ifNull: [{ $arrayElemAt: ["$$item.0.price", 0] }, 0] }
                      ]
                    }
                  ]
                }
              }
            }
          }
        }
      },
      { $sort: sortBy === 'amount' ? { finalAmount: sortOrder === 'asc' ? 1 : -1 } : { orderDate: sortOrder === 'asc' ? 1 : -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    // Count pipeline
    const countPipeline = [
      { $match: matchStage },
      ...(orderStatus !== 'all' ? [
        { $unwind: "$orderedItems" },
        { $match: { "orderedItems.status": orderStatus } },
        { $group: { _id: "$_id" } }
      ] : []),
      { $count: "total" }
    ];

    // Execute aggregations
    const [orders, countResult] = await Promise.all([
      Order.aggregate(ordersPipeline),
      Order.aggregate(countPipeline)
    ]);

    // Format orders for display
    const formattedOrders = orders.map(order => {
      const orderedItems = order.items.map((item, index) => {
        const productDetail = order.products[index];
        return {
          ...item,
          productName: productDetail ? productDetail.productName : 'Unknown Product',
          productImage: productDetail && productDetail.productImage ? productDetail.productImage[0] : null,
          originalPrice: productDetail ? productDetail.price : 0,
          discountPerItem: productDetail ? (productDetail.price - item.price) : 0,
          offerPercentage: productDetail ? productDetail.offerPercentage || 0 : 0
        };
      });

      const displayOrderId = order.orderNumber || `MK${order._id.toString().slice(-5)}`;

      return {
        _id: order._id,
        orderId: order.orderId || order._id.toString().slice(-5).toUpperCase(),
        orderNumber: order.orderNumber,
        displayOrderId: displayOrderId,
        orderDate: order.orderDate,
        formattedOrderDate: moment(order.orderDate).format('YYYY-MM-DD HH:mm'),
        customerName: order.userName || 'Unknown',
        customerEmail: order.userEmail || 'Unknown',
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        finalAmount: order.finalAmount,
        discount: order.discount || 0,
        shippingCharge: order.shippingCharge || 0,
        totalDiscount: order.totalDiscount || 0,
        discountPercentage: order.finalAmount > 0 ? Math.round((order.totalDiscount / (order.finalAmount + order.totalDiscount)) * 100) : 0,
        itemCount: order.itemCount || 0,
        orderedItems: orderedItems
      };
    });

    // Get pagination data
    const totalItems = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalItems / limit);

    res.json({
      success: true,
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error("Sales report orders error:", error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

// AJAX endpoint for sales report products pagination
exports.getSalesReportProducts = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get filter parameters
    const filter = req.query.filter || 'custom';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const productsSortBy = req.query.productsSortBy || 'revenue';
    const productsSortOrder = req.query.productsSortOrder || 'desc';

    // Pagination parameters for products
    const productsPage = Math.max(parseInt(req.query.page) || 1, 1);
    const productsLimit = parseInt(req.query.limit) || 5;
    const productsSkip = (productsPage - 1) * productsLimit;

    // Date filtering logic
    let startDate, endDate;
    if (filter === 'today') {
      startDate = moment().startOf('day').toDate();
      endDate = moment().endOf('day').toDate();
    } else if (filter === 'this_week') {
      startDate = moment().startOf('week').toDate();
      endDate = moment().endOf('week').toDate();
    } else if (filter === 'this_month') {
      startDate = moment().startOf('month').toDate();
      endDate = moment().endOf('month').toDate();
    } else if (filter === 'this_year') {
      startDate = moment().startOf('year').toDate();
      endDate = moment().endOf('year').toDate();
    } else if (filter === 'all_time') {
      startDate = new Date(0);
      endDate = moment().endOf('day').toDate();
    } else if (filter === 'custom') {
      try {
        startDate = req.query.startDate
          ? moment(req.query.startDate).startOf('day').toDate()
          : moment().subtract(30, 'days').startOf('day').toDate();
        endDate = req.query.endDate
          ? moment(req.query.endDate).endOf('day').toDate()
          : moment().endOf('day').toDate();
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid date format");
        }
      } catch (error) {
        startDate = moment().subtract(30, 'days').startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
      }
    }

    // Build match stage for aggregation
    let matchStage = { orderDate: { $gte: startDate, $lte: endDate } };
    if (paymentMethod !== 'all') {
      matchStage.paymentMethod = paymentMethod;
    }

    // Top products pipeline
    const topProductsPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      ...(orderStatus !== 'all' ? [{ $match: { "orderedItems.status": orderStatus } }] : []),
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "productDetails.category",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$orderedItems.product",
          name: { $first: "$productDetails.productName" },
          image: { $first: { $arrayElemAt: ["$productDetails.productImage", 0] } },
          brand: { $first: "$productDetails.brand" },
          category: { $first: "$categoryDetails.name" },
          quantity: { $sum: "$orderedItems.quantity" },
          revenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
          originalPrice: { $first: "$productDetails.price" },
          offerPercentage: { $first: "$productDetails.offerPercentage" },
          offerType: { $first: "$productDetails.offerType" },
          discountPercentage: { $first: "$orderedItems.discountPercentage" },
          originalRevenue: {
            $sum: {
              $multiply: [
                "$orderedItems.quantity",
                { $ifNull: ["$productDetails.price", 0] }
              ]
            }
          },
          totalDiscount: {
            $sum: {
              $multiply: [
                "$orderedItems.quantity",
                {
                  $subtract: [
                    { $ifNull: ["$productDetails.price", 0] },
                    { $ifNull: ["$orderedItems.price", 0] }
                  ]
                }
              ]
            }
          }
        }
      },
      {
        $sort: {
          [productsSortBy === 'quantity' ? 'quantity' :
           productsSortBy === 'discount' ? 'totalDiscount' :
           productsSortBy === 'original' ? 'originalRevenue' : 'revenue']:
           productsSortOrder === 'asc' ? 1 : -1
        }
      },
      { $skip: productsSkip },
      { $limit: productsLimit }
    ];

    // Top products count pipeline for pagination
    const topProductsCountPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      ...(orderStatus !== 'all' ? [{ $match: { "orderedItems.status": orderStatus } }] : []),
      {
        $group: {
          _id: "$orderedItems.product"
        }
      },
      { $count: "total" }
    ];

    // Execute aggregations
    const [topProducts, topProductsCountResult] = await Promise.all([
      Order.aggregate(topProductsPipeline),
      Order.aggregate(topProductsCountPipeline)
    ]);

    // Get pagination data for top products
    const totalProductItems = topProductsCountResult.length > 0 ? topProductsCountResult[0].total : 0;
    const totalProductPages = Math.ceil(totalProductItems / productsLimit);

    res.json({
      success: true,
      products: topProducts,
      pagination: {
        page: productsPage,
        limit: productsLimit,
        totalItems: totalProductItems,
        totalPages: totalProductPages,
        hasNextPage: productsPage < totalProductPages,
        hasPrevPage: productsPage > 1
      }
    });
  } catch (error) {
    console.error("Sales report products error:", error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate and download sales report as CSV
 */
exports.downloadSalesReport = async (req, res) => {
  try {
    console.log("Generating sales report CSV...");
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    // Get filter parameters
    const filter = req.query.filter || 'custom';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const sortBy = req.query.sortBy || 'date';
    const sortOrder = req.query.sortOrder || 'desc';

    // Date filtering logic
    let startDate, endDate;
    const now = new Date();

    if (filter === 'today') {
      startDate = moment().startOf('day').toDate();
      endDate = moment().endOf('day').toDate();
    } else if (filter === 'this_week') {
      startDate = moment().startOf('week').toDate();
      endDate = moment().endOf('week').toDate();
    } else if (filter === 'this_month') {
      startDate = moment().startOf('month').toDate();
      endDate = moment().endOf('month').toDate();
    } else if (filter === 'this_year') {
      startDate = moment().startOf('year').toDate();
      endDate = moment().endOf('year').toDate();
    } else if (filter === 'all_time') {
      startDate = new Date(0); // Beginning of time
      endDate = moment().endOf('day').toDate();
    } else if (filter === 'custom') {
      try {
        startDate = req.query.startDate
          ? moment(req.query.startDate).startOf('day').toDate()
          : moment().subtract(30, 'days').startOf('day').toDate();

        endDate = req.query.endDate
          ? moment(req.query.endDate).endOf('day').toDate()
          : moment().endOf('day').toDate();

        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid date format");
        }
      } catch (error) {
        console.error("Date parsing error:", error);
        startDate = moment().subtract(30, 'days').startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
      }
    }

    console.log(`CSV Filters: filter=${filter}, startDate=${startDate}, endDate=${endDate}, paymentMethod=${paymentMethod}, orderStatus=${orderStatus}`);

    // Build match stage for aggregation
    let matchStage = { orderDate: { $gte: startDate, $lte: endDate } };

    if (paymentMethod !== 'all') {
      matchStage.paymentMethod = paymentMethod;
    }

    // Define aggregation pipeline for CSV export
    const csvPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      // Filter by order status if specified
      ...(orderStatus !== 'all' ? [{ $match: { "orderedItems.status": orderStatus } }] : []),
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          orderId: 1,
          orderDate: 1,
          customerName: "$user.name",
          customerEmail: "$user.email",
          paymentMethod: 1,
          paymentStatus: 1,
          productName: "$product.productName",
          productCategory: "$product.category",
          quantity: "$orderedItems.quantity",
          price: "$orderedItems.price",
          originalPrice: "$product.price",
          status: "$orderedItems.status",
          discount: {
            $subtract: [
              { $ifNull: ["$product.price", 0] },
              { $ifNull: ["$orderedItems.price", 0] }
            ]
          },
          totalAmount: { $multiply: ["$orderedItems.quantity", "$orderedItems.price"] },
          totalDiscount: {
            $multiply: [
              "$orderedItems.quantity",
              {
                $subtract: [
                  { $ifNull: ["$product.price", 0] },
                  { $ifNull: ["$orderedItems.price", 0] }
                ]
              }
            ]
          }
        }
      },
      { $sort: sortBy === 'amount' ? { totalAmount: sortOrder === 'asc' ? 1 : -1 } : { orderDate: sortOrder === 'asc' ? 1 : -1 } }
    ];

    // Execute aggregation
    const orderItems = await Order.aggregate(csvPipeline);
    console.log(`Retrieved ${orderItems.length} order items for CSV export`);

    // Generate CSV content
    let csvContent = "Order ID,Date,Customer,Email,Payment Method,Payment Status,Product,Category,Quantity,Original Price,Discounted Price,Discount Amount,Status,Total Amount\n";

    orderItems.forEach(item => {
      // Use orderNumber if available, otherwise use a shortened version of the ID (5 digits)
      const orderId = item.orderNumber || `MK${item._id.toString().slice(-5)}`;
      const date = moment(item.orderDate).format('YYYY-MM-DD HH:mm');
      const customerName = item.customerName || 'Unknown';
      const customerEmail = item.customerEmail || 'No email';
      const paymentMethod = item.paymentMethod ? item.paymentMethod.toUpperCase() : 'UNKNOWN';
      const paymentStatus = item.paymentStatus || 'Unknown';
      const productName = item.productName || 'Unknown Product';
      const productCategory = item.productCategory || 'Unknown Category';
      const quantity = item.quantity || 0;
      const originalPrice = (item.originalPrice || 0).toFixed(2);
      const discountedPrice = (item.price || 0).toFixed(2);
      const discountAmount = (item.discount || 0).toFixed(2);
      const status = item.status || 'Unknown';
      const totalAmount = (item.totalAmount || 0).toFixed(2);
      const totalDiscount = (item.totalDiscount || 0).toFixed(2);

      csvContent += `"${orderId}","${date}","${customerName}","${customerEmail}","${paymentMethod}","${paymentStatus}","${productName}","${productCategory}","${quantity}","${originalPrice}","${discountedPrice}","${discountAmount}","${status}","${totalAmount}"\n`;
    });

    // Add summary row
    const totalQuantity = orderItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalAmount = orderItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0).toFixed(2);
    const totalDiscount = orderItems.reduce((sum, item) => sum + (item.totalDiscount || 0), 0).toFixed(2);

    csvContent += `\n"TOTAL","","","","","","","","${totalQuantity}","","","${totalDiscount}","","${totalAmount}"\n`;

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.csv`);

    // Send CSV content
    res.send(csvContent);
    console.log("CSV report generated and sent successfully");
  } catch (error) {
    console.error("Error downloading sales report CSV:", error);
    // Render the error page instead of sending a plain text response
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/admin-error", {
      message: "Failed to generate CSV sales report",
      activePage: "reports"
    });
  }
};

/**
 * Generate and download sales report as PDF
 */
exports.downloadSalesReportPDF = async (req, res) => {
  try {
    console.log("Generating sales report PDF...");
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    // Get filter parameters
    const filter = req.query.filter || 'custom';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const sortBy = req.query.sortBy || 'date';
    const sortOrder = req.query.sortOrder || 'desc';

    // Date filtering logic
    let startDate, endDate;
    const now = new Date();

    if (filter === 'today') {
      startDate = moment().startOf('day').toDate();
      endDate = moment().endOf('day').toDate();
    } else if (filter === 'this_week') {
      startDate = moment().startOf('week').toDate();
      endDate = moment().endOf('week').toDate();
    } else if (filter === 'this_month') {
      startDate = moment().startOf('month').toDate();
      endDate = moment().endOf('month').toDate();
    } else if (filter === 'this_year') {
      startDate = moment().startOf('year').toDate();
      endDate = moment().endOf('year').toDate();
    } else if (filter === 'all_time') {
      startDate = new Date(0); // Beginning of time
      endDate = moment().endOf('day').toDate();
    } else if (filter === 'custom') {
      try {
        startDate = req.query.startDate
          ? moment(req.query.startDate).startOf('day').toDate()
          : moment().subtract(30, 'days').startOf('day').toDate();

        endDate = req.query.endDate
          ? moment(req.query.endDate).endOf('day').toDate()
          : moment().endOf('day').toDate();

        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid date format");
        }
      } catch (error) {
        console.error("Date parsing error:", error);
        startDate = moment().subtract(30, 'days').startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
      }
    }

    // Build match stage for aggregation
    let matchStage = { orderDate: { $gte: startDate, $lte: endDate } };

    if (paymentMethod !== 'all') {
      matchStage.paymentMethod = paymentMethod;
    }

    // Get orders with populated product details
    const ordersPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      ...(orderStatus !== 'all' ? [{ $match: { "orderedItems.status": orderStatus } }] : []),
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          orderId: 1,
          orderNumber: 1,
          orderDate: 1,
          paymentMethod: 1,
          paymentStatus: 1,
          finalAmount: 1,
          "orderedItems.product": 1,
          "orderedItems.quantity": 1,
          "orderedItems.price": 1,
          "orderedItems.status": 1,
          "productDetails.productName": 1,
          "productDetails.price": 1,
          "userDetails.name": 1,
          "userDetails.email": 1
        }
      }
    ];

    // Add sorting
    switch (sortBy) {
      case 'amount':
        ordersPipeline.push({ $sort: { finalAmount: sortOrder === 'asc' ? 1 : -1 } });
        break;
      case 'date':
      default:
        ordersPipeline.push({ $sort: { orderDate: sortOrder === 'asc' ? 1 : -1 } });
        break;
    }

    const orders = await Order.aggregate(ordersPipeline);

    // Get summary data
    const summaryPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      ...(orderStatus !== 'all' ? [{ $match: { "orderedItems.status": orderStatus } }] : []),
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalOrders: { $addToSet: "$_id" },
          totalSales: { $sum: "$finalAmount" },
          totalProducts: { $sum: "$orderedItems.quantity" },
          totalDiscount: {
            $sum: {
              $multiply: [
                "$orderedItems.quantity",
                {
                  $subtract: [
                    { $ifNull: ["$productDetails.price", 0] },
                    { $ifNull: ["$orderedItems.price", 0] }
                  ]
                }
              ]
            }
          },
          minOrderValue: { $min: "$finalAmount" },
          maxOrderValue: { $max: "$finalAmount" }
        }
      }
    ];

    const summaryResults = await Order.aggregate(summaryPipeline);
    const summary = summaryResults.length > 0 ? summaryResults[0] : {
      totalOrders: [],
      totalSales: 0,
      totalProducts: 0,
      totalDiscount: 0,
      minOrderValue: 0,
      maxOrderValue: 0
    };

    summary.totalOrders = summary.totalOrders.length;
    summary.avgOrderValue = summary.totalOrders > 0 ? summary.totalSales / summary.totalOrders : 0;

    // Get payment method distribution
    const paymentMethodPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          total: { $sum: "$finalAmount" }
        }
      }
    ];

    const paymentMethodResults = await Order.aggregate(paymentMethodPipeline);
    const paymentSummary = {};

    paymentMethodResults.forEach(result => {
      paymentSummary[result._id] = {
        count: result.count,
        total: result.total
      };
    });

    // Calculate offer summary data for PDF
    const offerSummary = {
      productOffers: { count: 0, savings: 0 },
      categoryOffers: { count: 0, savings: 0 },
      coupons: { count: 0, savings: 0 },
      totalSavings: summary.totalDiscount || 0
    };

    // Count products with offers by type from orders
    const productsWithOffers = new Map();

    orders.forEach(order => {
      // Check for product and category offers
      if (order.productDetails && order.productDetails.offerPercentage > 0) {
        const productId = order.productDetails._id.toString();
        if (!productsWithOffers.has(productId)) {
          productsWithOffers.set(productId, {
            offerType: order.productDetails.offerType,
            totalDiscount: 0
          });
        }

        const product = productsWithOffers.get(productId);
        const itemDiscount = (order.productDetails.price - order.orderedItems.price) * order.orderedItems.quantity;
        product.totalDiscount += itemDiscount;
      }

      // Check for coupon usage
      if (order.couponApplied && order.coupon) {
        offerSummary.coupons.count++;
        // Calculate approximate coupon savings
        if (order.discount > 0) {
          offerSummary.coupons.savings += order.discount;
        }
      }
    });

    // Count products by offer type
    productsWithOffers.forEach(product => {
      if (product.offerType === 'product') {
        offerSummary.productOffers.count++;
        offerSummary.productOffers.savings += product.totalDiscount;
      } else if (product.offerType === 'category') {
        offerSummary.categoryOffers.count++;
        offerSummary.categoryOffers.savings += product.totalDiscount;
      }
    });

    // Make sure total savings is the sum of all savings types
    offerSummary.totalSavings =
      offerSummary.productOffers.savings +
      offerSummary.categoryOffers.savings +
      offerSummary.coupons.savings;

    // Get top products for PDF
    const topProductsPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },
      ...(orderStatus !== 'all' ? [{ $match: { "orderedItems.status": orderStatus } }] : []),
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "productDetails.category",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$orderedItems.product",
          name: { $first: "$productDetails.productName" },
          category: { $first: "$categoryDetails.name" },
          brand: { $first: "$productDetails.brand" },
          quantity: { $sum: "$orderedItems.quantity" },
          revenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
          originalPrice: { $first: "$productDetails.price" },
          offerPercentage: { $first: "$productDetails.offerPercentage" },
          offerType: { $first: "$productDetails.offerType" },
          // Calculate original revenue based on product's original price
          originalRevenue: {
            $sum: {
              $multiply: [
                "$orderedItems.quantity",
                { $ifNull: ["$productDetails.price", 0] }
              ]
            }
          },
          totalDiscount: {
            $sum: {
              $multiply: [
                "$orderedItems.quantity",
                {
                  $subtract: [
                    { $ifNull: ["$productDetails.price", 0] },
                    { $ifNull: ["$orderedItems.price", 0] }
                  ]
                }
              ]
            }
          }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ];

    const topProducts = await Order.aggregate(topProductsPipeline);

    // Create a new PDF document with better margins and layout
    const doc = new PDFDocument({
      margin: 50,
      autoFirstPage: true,
      size: 'A4',
      bufferPages: true, // Enable buffer pages for page numbering
      info: {
        Title: 'Mangeyko Sales Report',
        Author: 'Mangeyko Admin',
        Subject: `Sales Report ${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`,
        Keywords: 'sales, report, mangeyko, ecommerce',
        Creator: 'Mangeyko Sales Report System',
        Producer: 'PDFKit'
      }
    });

    // Set up page numbering
    let pageNumber = 1;
    doc.on('pageAdded', () => {
      pageNumber++;
    });

    // Helper function to check if we need a new page
    const checkNewPage = (currentY, neededSpace = 150) => {
      if (currentY + neededSpace > doc.page.height - 100) {
        doc.addPage();
        return 50; // Return the Y position for the new page
      }
      return currentY;
    };

    // Helper function to format currency
    const formatCurrency = (amount) => {
      return '₹' + amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    };

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=mangeyko-sales-report-${moment(startDate).format('YYYY-MM-DD')}-to-${moment(endDate).format('YYYY-MM-DD')}.pdf`);

    // Pipe the PDF to the response
    doc.pipe(res);

    // Add content to the PDF - Professional Header
    doc.fontSize(22).fillColor('#333333').text('MANGEYKO', { align: 'center' });
    doc.fontSize(10).fillColor('#666666').text('E-Commerce Sales Report', { align: 'center' });
    doc.moveDown(0.5);

    // Add a styled report title
    doc.fontSize(16).fillColor('#000000').text('SALES REPORT', { align: 'center' });
    doc.fontSize(12).fillColor('#666666').text(`Period: ${moment(startDate).format('DD MMM YYYY')} to ${moment(endDate).format('DD MMM YYYY')}`, { align: 'center' });

    // Add report filters
    let filterText = '';
    if (paymentMethod !== 'all') {
      filterText += `Payment Method: ${paymentMethod.toUpperCase()}, `;
    }
    if (orderStatus !== 'all') {
      filterText += `Order Status: ${orderStatus}, `;
    }

    if (filterText) {
      doc.fontSize(10).fillColor('#666666').text(`Filters: ${filterText.slice(0, -2)}`, { align: 'center' });
    }

    doc.moveDown(1);

    // Add a styled line under the header
    doc.strokeColor('#4e73df').lineWidth(2)
       .moveTo(50, doc.y)
       .lineTo(doc.page.width - 50, doc.y)
       .stroke();
    doc.moveDown(1.5);

    // Summary section with better layout and styling
    doc.fontSize(14).fillColor('#4e73df').text('SALES SUMMARY', { underline: false });
    doc.moveDown(0.5);

    // Create a styled box for summary data
    const boxTop = doc.y;
    const boxHeight = 120;

    // Draw a light background for the summary box
    doc.fillColor('#f8f9fc').roundedRect(50, boxTop, doc.page.width - 100, boxHeight, 5).fill();
    doc.fillColor('#000000'); // Reset text color

    // Create a two-column layout for summary data
    const col1X = 70;
    const col2X = doc.page.width / 2 + 20;
    let currentY = boxTop + 15;

    // Column 1 - with better styling
    doc.fontSize(10).fillColor('#666666').text(`Total Orders:`, col1X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${summary.totalOrders}`, col1X + 150, currentY, { align: 'left' });
    currentY += 20;

    // Original amount (before discounts)
    const originalAmount = summary.totalOriginalValue || summary.totalSales;
    doc.fontSize(10).fillColor('#666666').text(`Original Amount:`, col1X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${formatCurrency(originalAmount)}`, col1X + 150, currentY, { align: 'left' });
    currentY += 20;

    doc.fontSize(10).fillColor('#666666').text(`Total Revenue:`, col1X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${formatCurrency(summary.totalSales)}`, col1X + 150, currentY, { align: 'left' });
    currentY += 20;

    // Net sales (already includes discounts)
    const summaryNetSales = summary.totalSales;
    doc.fontSize(10).fillColor('#666666').text(`Net Sales:`, col1X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${formatCurrency(summaryNetSales)}`, col1X + 150, currentY, { align: 'left' });
    currentY += 20;

    doc.fontSize(10).fillColor('#666666').text(`Total Products Sold:`, col1X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${summary.totalProducts}`, col1X + 150, currentY, { align: 'left' });

    // Reset Y position for column 2
    currentY = boxTop + 15;

    // Column 2 - with better styling
    doc.fontSize(10).fillColor('#666666').text(`Average Order Value:`, col2X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${formatCurrency(summary.avgOrderValue)}`, col2X + 150, currentY, { align: 'left' });
    currentY += 20;

    doc.fontSize(10).fillColor('#666666').text(`Minimum Order Value:`, col2X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${formatCurrency(summary.minOrderValue)}`, col2X + 150, currentY, { align: 'left' });
    currentY += 20;

    doc.fontSize(10).fillColor('#666666').text(`Maximum Order Value:`, col2X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${formatCurrency(summary.maxOrderValue)}`, col2X + 150, currentY, { align: 'left' });
    currentY += 20;

    // Add discount information if available
    if (summary.totalDiscount) {
      doc.fontSize(10).fillColor('#666666').text(`Total Discount:`, col2X, currentY);
      doc.fontSize(10).fillColor('#000000').text(`${formatCurrency(summary.totalDiscount)}`, col2X + 150, currentY, { align: 'left' });
      currentY += 20;

      // Calculate and display discount percentage
      const discountPercentage = (summary.totalDiscount / (summary.totalSales + summary.totalDiscount) * 100).toFixed(2);
      doc.fontSize(10).fillColor('#666666').text(`Discount Percentage:`, col2X, currentY);
      doc.fontSize(10).fillColor('#000000').text(`${discountPercentage}%`, col2X + 150, currentY, { align: 'left' });
    }

    // Move down after the summary section
    doc.y = boxTop + boxHeight + 20;

    // Check if we need a new page for payment methods
    doc.y = checkNewPage(doc.y, 150);

    // Payment Method Summary with styled table layout
    doc.fontSize(14).fillColor('#4e73df').text('PAYMENT METHODS', { underline: false });
    doc.moveDown(0.5);

    // Create a table for payment methods
    const methodTableTop = doc.y;
    const methodX = 70;
    const countX = 250;
    const totalX = 350;
    const avgX = 450;

    // Draw table header background
    doc.fillColor('#4e73df').rect(50, methodTableTop, doc.page.width - 100, 20).fill();

    // Add table headers with white text
    doc.fillColor('#ffffff');
    doc.fontSize(10).text('PAYMENT METHOD', methodX, methodTableTop + 5, { bold: true });
    doc.fontSize(10).text('ORDERS', countX, methodTableTop + 5, { bold: true });
    doc.fontSize(10).text('AMOUNT', totalX, methodTableTop + 5, { bold: true });
    doc.fontSize(10).text('AVG. ORDER', avgX, methodTableTop + 5, { bold: true });

    // Reset fill color for table content
    doc.fillColor('#000000');

    // Add payment method rows with alternating background
    let methodY = methodTableTop + 20;
    let rowCount = 0;

    Object.keys(paymentSummary).forEach((method, index) => {
      const data = paymentSummary[method];
      const avg = data.count > 0 ? data.total / data.count : 0;

      // Check if we need a new page
      methodY = checkNewPage(methodY, 30);

      // Add alternating row background
      if (rowCount % 2 === 0) {
        doc.fillColor('#f8f9fc').rect(50, methodY, doc.page.width - 100, 20).fill();
      }
      doc.fillColor('#000000'); // Reset text color

      // Format method name nicely
      const methodName = method.charAt(0).toUpperCase() + method.slice(1);

      doc.fontSize(10).text(methodName, methodX, methodY + 5);
      doc.fontSize(10).text(`${data.count}`, countX, methodY + 5);
      doc.fontSize(10).text(`${formatCurrency(data.total)}`, totalX, methodY + 5);
      doc.fontSize(10).text(`${formatCurrency(avg)}`, avgX, methodY + 5);

      methodY += 20;
      rowCount++;
    });

    // Add a total row with bold styling
    methodY = checkNewPage(methodY, 30);

    // Add total row background
    doc.fillColor('#eaecf4').rect(50, methodY, doc.page.width - 100, 25).fill();
    doc.fillColor('#000000'); // Reset text color

    const totalCount = Object.values(paymentSummary).reduce((sum, data) => sum + data.count, 0);
    const totalAmount = Object.values(paymentSummary).reduce((sum, data) => sum + data.total, 0);
    const totalAvg = totalCount > 0 ? totalAmount / totalCount : 0;

    doc.fontSize(10).font('Helvetica-Bold')
       .text('TOTAL', methodX, methodY + 7)
       .text(`${totalCount}`, countX, methodY + 7)
       .text(`${formatCurrency(totalAmount)}`, totalX, methodY + 7)
       .text(`${formatCurrency(totalAvg)}`, avgX, methodY + 7);

    // Add original amount row (before discounts)
    methodY += 25;

    // Check if we need a new page
    methodY = checkNewPage(methodY, 30);

    // Add original amount row background
    doc.fillColor('#e8f4f8').rect(50, methodY, doc.page.width - 100, 25).fill();
    doc.fillColor('#000000'); // Reset text color

    // Calculate original amount (before discounts)
    const paymentOriginalAmount = summary.totalOriginalValue || totalAmount;
    const originalAvg = totalCount > 0 ? paymentOriginalAmount / totalCount : 0;

    doc.fontSize(10).font('Helvetica-Bold')
       .text('ORIGINAL AMOUNT', methodX, methodY + 7)
       .text('', countX, methodY + 7)
       .text(`${formatCurrency(paymentOriginalAmount)}`, totalX, methodY + 7)
       .text(`${formatCurrency(originalAvg)}`, avgX, methodY + 7);

    // Add net sales row (after discounts)
    methodY += 25;

    // Check if we need a new page
    methodY = checkNewPage(methodY, 30);

    // Add net sales row background
    doc.fillColor('#d1ecf1').rect(50, methodY, doc.page.width - 100, 25).fill();
    doc.fillColor('#000000'); // Reset text color

    // Show net sales (already includes discounts)
    const paymentNetSales = totalAmount;
    const netAvg = totalCount > 0 ? paymentNetSales / totalCount : 0;

    doc.fontSize(10).font('Helvetica-Bold')
       .text('NET SALES', methodX, methodY + 7)
       .text('', countX, methodY + 7)
       .text(`${formatCurrency(paymentNetSales)}`, totalX, methodY + 7)
       .text(`${formatCurrency(netAvg)}`, avgX, methodY + 7);

    // Reset font
    doc.font('Helvetica');

    // Add a border around the entire table
    doc.strokeColor('#d1d3e2').lineWidth(1)
       .rect(50, methodTableTop, doc.page.width - 100, methodY + 25 - methodTableTop)
       .stroke();

    // Move down after the table
    doc.y = methodY + 35;

    // Check if we need a new page for filters
    doc.y = checkNewPage(doc.y, 150);

    // Filter Information with better layout and styling
    doc.fontSize(14).fillColor('#4e73df').text('APPLIED FILTERS', { underline: false });
    doc.moveDown(0.5);

    // Create a styled box for filter data
    const filterBoxTop = doc.y;
    const filterBoxHeight = 100;

    // Draw a light background for the filter box
    doc.fillColor('#f8f9fc').roundedRect(50, filterBoxTop, doc.page.width - 100, filterBoxHeight, 5).fill();
    doc.fillColor('#000000'); // Reset text color

    // Create a two-column layout for filters
    const filterY = filterBoxTop + 15;
    const filterLabelX = 70;
    const filterValueX = 220;
    const filterLabel2X = doc.page.width / 2 + 20;
    const filterValue2X = filterLabel2X + 150;

    // Add filter information with icons and better styling - Column 1
    doc.fontSize(10).fillColor('#666666').text('Date Range:', filterLabelX, filterY);
    doc.fontSize(10).fillColor('#000000').text(`${filter === 'custom' ? 'Custom' : filter.charAt(0).toUpperCase() + filter.slice(1)}`, filterValueX, filterY);

    doc.fontSize(10).fillColor('#666666').text('Payment Method:', filterLabelX, filterY + 30);
    doc.fontSize(10).fillColor('#000000').text(`${paymentMethod === 'all' ? 'All Methods' : paymentMethod.toUpperCase()}`, filterValueX, filterY + 30);

    // Column 2
    doc.fontSize(10).fillColor('#666666').text('Order Status:', filterLabel2X, filterY);
    doc.fontSize(10).fillColor('#000000').text(`${orderStatus === 'all' ? 'All Statuses' : orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1)}`, filterValue2X, filterY);

    doc.fontSize(10).fillColor('#666666').text('Sort By:', filterLabel2X, filterY + 30);
    doc.fontSize(10).fillColor('#000000').text(`${sortBy === 'date' ? 'Date' : 'Amount'} (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`, filterValue2X, filterY + 30);

    // Add a note about the filters
    doc.fontSize(8).fillColor('#666666')
       .text('Note: This report shows data filtered according to the criteria above. For a complete report, reset all filters.',
             70, filterY + 60, { width: doc.page.width - 140, align: 'center' });

    // Move down after filters
    doc.y = filterBoxTop + filterBoxHeight + 20;

    // Add Top Products section (with additional null check)
    if (topProducts && Array.isArray(topProducts) && topProducts.length > 0) {
      doc.y = checkNewPage(doc.y, 200);

      doc.fontSize(14).fillColor('#4e73df').text('TOP SELLING PRODUCTS', { underline: false });
      doc.moveDown(0.5);

      // Create a table for top products
      const productsTableTop = doc.y;
      const rankX = 60;
      const productX = 90;
      const categoryX = 230;
      const quantityX = 310;
      const priceX = 360;
      const revenueX = 430;
      const originalX = 500;

      // Draw table header background
      doc.fillColor('#4e73df').rect(50, productsTableTop, doc.page.width - 100, 20).fill();

      // Add table headers with white text
      doc.fillColor('#ffffff');
      doc.fontSize(10).text('RANK', rankX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('PRODUCT', productX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('CATEGORY', categoryX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('QTY', quantityX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('UNIT PRICE', priceX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('REVENUE', revenueX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('ORIGINAL', originalX, productsTableTop + 5, { bold: true });

      // Reset fill color for table content
      doc.fillColor('#000000');

      // Add product rows with alternating background
      let productY = productsTableTop + 20;

      topProducts.forEach((product, index) => {
        // Skip products with missing essential data
        if (!product) return;

        // Check if we need a new page
        productY = checkNewPage(productY, 30);

        // Add alternating row background
        if (index % 2 === 0) {
          doc.fillColor('#f8f9fc').rect(50, productY, doc.page.width - 100, 25).fill();
        }
        doc.fillColor('#000000'); // Reset text color

        // Format product name (truncate if too long)
        const productName = product.name || product.productName || 'Unknown Product';
        const truncatedName = productName.length > 25 ?
          productName.substring(0, 22) + '...' : productName;

        // Format category name
        const categoryName = product.category || 'Uncategorized';

        // Calculate price with and without discount (with null checks)
        const originalPrice = product.originalPrice || 0;
        const quantity = product.quantity || 0;
        const revenue = product.revenue || 0;
        const discountedPrice = quantity > 0 ? revenue / quantity : 0;
        const productOriginalAmount = originalPrice * quantity;

        // Format unit price display (with null check)
        const offerPercentage = product.offerPercentage || 0;
        const priceDisplay = formatCurrency(discountedPrice);

        // Add row data (using our safer variables)
        doc.fontSize(9).text(`#${index + 1}`, rankX, productY + 7);
        doc.fontSize(9).text(truncatedName, productX, productY + 7, { width: 130 });
        doc.fontSize(9).text(categoryName, categoryX, productY + 7, { width: 70 });
        doc.fontSize(9).text(`${quantity}`, quantityX, productY + 7, { width: 40 });
        doc.fontSize(9).text(priceDisplay, priceX, productY + 7, { width: 60 });
        doc.fontSize(9).text(formatCurrency(revenue), revenueX, productY + 7, { width: 60 });
        doc.fontSize(9).text(formatCurrency(productOriginalAmount), originalX, productY + 7, { width: 60 });

        productY += 25;
      });

      // Add a border around the entire table
      doc.strokeColor('#d1d3e2').lineWidth(1)
         .rect(50, productsTableTop, doc.page.width - 100, productY - productsTableTop)
         .stroke();

      // Move down after the table
      doc.y = productY + 20;
    }

    // Add Offers Summary section if there are any offers
    if (offerSummary && (offerSummary.productOffers.count > 0 || offerSummary.categoryOffers.count > 0 || offerSummary.coupons.count > 0)) {
      doc.y = checkNewPage(doc.y, 180);

      doc.fontSize(14).fillColor('#4e73df').text('OFFERS & DISCOUNTS', { underline: false });
      doc.moveDown(0.5);

      // Create a table for offers summary
      const offerTableTop = doc.y;
      const offerTypeX = 70;
      const offerCountX = 250;
      const offerSavingsX = 350;
      const offerPercentX = 450;

      // Draw table header background
      doc.fillColor('#4e73df').rect(50, offerTableTop, doc.page.width - 100, 20).fill();

      // Add table headers with white text
      doc.fillColor('#ffffff');
      doc.fontSize(10).text('OFFER TYPE', offerTypeX, offerTableTop + 5, { bold: true });
      doc.fontSize(10).text('PRODUCTS', offerCountX, offerTableTop + 5, { bold: true });
      doc.fontSize(10).text('SAVINGS', offerSavingsX, offerTableTop + 5, { bold: true });
      doc.fontSize(10).text('% OF TOTAL', offerPercentX, offerTableTop + 5, { bold: true });

      // Reset fill color for table content
      doc.fillColor('#000000');

      // Add offer rows with alternating background
      let offerY = offerTableTop + 20;

      // Product Offers row
      doc.fillColor('#f8f9fc').rect(50, offerY, doc.page.width - 100, 20).fill();
      doc.fillColor('#000000'); // Reset text color

      const productOfferPercent = offerSummary.totalSavings > 0
        ? (offerSummary.productOffers.savings / offerSummary.totalSavings * 100).toFixed(1)
        : '0.0';

      doc.fontSize(10).text('Product Offers', offerTypeX, offerY + 5);
      doc.fontSize(10).text(`${offerSummary.productOffers.count}`, offerCountX, offerY + 5);
      doc.fontSize(10).text(`${formatCurrency(offerSummary.productOffers.savings)}`, offerSavingsX, offerY + 5);
      doc.fontSize(10).text(`${productOfferPercent}%`, offerPercentX, offerY + 5);

      offerY += 20;

      // Category Offers row
      doc.fillColor('#ffffff').rect(50, offerY, doc.page.width - 100, 20).fill();
      doc.fillColor('#000000'); // Reset text color

      const categoryOfferPercent = offerSummary.totalSavings > 0
        ? (offerSummary.categoryOffers.savings / offerSummary.totalSavings * 100).toFixed(1)
        : '0.0';

      doc.fontSize(10).text('Category Offers', offerTypeX, offerY + 5);
      doc.fontSize(10).text(`${offerSummary.categoryOffers.count}`, offerCountX, offerY + 5);
      doc.fontSize(10).text(`${formatCurrency(offerSummary.categoryOffers.savings)}`, offerSavingsX, offerY + 5);
      doc.fontSize(10).text(`${categoryOfferPercent}%`, offerPercentX, offerY + 5);

      offerY += 20;

      // Coupons row
      doc.fillColor('#f8f9fc').rect(50, offerY, doc.page.width - 100, 20).fill();
      doc.fillColor('#000000'); // Reset text color

      const couponPercent = offerSummary.totalSavings > 0
        ? (offerSummary.coupons.savings / offerSummary.totalSavings * 100).toFixed(1)
        : '0.0';

      doc.fontSize(10).text('Coupons', offerTypeX, offerY + 5);
      doc.fontSize(10).text(`${offerSummary.coupons.count}`, offerCountX, offerY + 5);
      doc.fontSize(10).text(`${formatCurrency(offerSummary.coupons.savings)}`, offerSavingsX, offerY + 5);
      doc.fontSize(10).text(`${couponPercent}%`, offerPercentX, offerY + 5);

      offerY += 20;

      // Total row with bold styling
      doc.fillColor('#eaecf4').rect(50, offerY, doc.page.width - 100, 25).fill();
      doc.fillColor('#000000'); // Reset text color

      const totalSavingsPercent = summary.totalSales > 0
        ? (offerSummary.totalSavings / (summary.totalSales + offerSummary.totalSavings) * 100).toFixed(1)
        : '0.0';

      doc.fontSize(10).font('Helvetica-Bold')
         .text('TOTAL SAVINGS', offerTypeX, offerY + 7)
         .text(`${offerSummary.productOffers.count + offerSummary.categoryOffers.count + offerSummary.coupons.count}`, offerCountX, offerY + 7)
         .text(`${formatCurrency(offerSummary.totalSavings)}`, offerSavingsX, offerY + 7)
         .text(`${totalSavingsPercent}% of sales`, offerPercentX, offerY + 7);

      // Reset font
      doc.font('Helvetica');

      // Add a border around the entire table
      doc.strokeColor('#d1d3e2').lineWidth(1)
         .rect(50, offerTableTop, doc.page.width - 100, offerY + 25 - offerTableTop)
         .stroke();

      // Move down after the table
      doc.y = offerY + 35;
    }

    // Check if we need a new page for orders table
    doc.y = checkNewPage(doc.y, 200);

    // Orders Table with improved layout
    doc.fontSize(14).fillColor('#4e73df').text('ORDER DETAILS', { underline: false });
    doc.moveDown(0.5);

    // Table headers with better styling and adjusted spacing
    const tableTop = doc.y;
    const orderIdX = 60;
    const dateX = 160;
    const customerX = 240;
    const paymentX = 340;
    const amountX = 420;
    const statusX = 490;

    // Draw table header background
    doc.fillColor('#4e73df').rect(50, tableTop, doc.page.width - 100, 20).fill();

    // Add table headers with white text
    doc.fillColor('#ffffff');
    doc.fontSize(10).text('ORDER ID', orderIdX, tableTop + 5);
    doc.fontSize(10).text('DATE', dateX, tableTop + 5);
    doc.fontSize(10).text('CUSTOMER', customerX, tableTop + 5);
    doc.fontSize(10).text('PAYMENT', paymentX, tableTop + 5);
    doc.fontSize(10).text('AMOUNT', amountX, tableTop + 5);
    doc.fontSize(10).text('STATUS', statusX, tableTop + 5);

    // Reset fill color for table content
    doc.fillColor('#000000');

    let tableRow = tableTop + 20;

    // Group orders by order ID
    const groupedOrders = {};
    orders.forEach(order => {
      if (!groupedOrders[order.orderId]) {
        groupedOrders[order.orderId] = {
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          customerName: order.userDetails ? order.userDetails.name : 'Unknown',
          finalAmount: order.finalAmount,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          items: []
        };
      }

      groupedOrders[order.orderId].items.push({
        productName: order.productDetails ? order.productDetails.productName : 'Unknown Product',
        quantity: order.orderedItems.quantity,
        price: order.orderedItems.price,
        status: order.orderedItems.status
      });
    });

    // Add order rows with better styling and alternating backgrounds
    let orderRowCount = 0;
    Object.values(groupedOrders).forEach((order, index) => {
      // Check if we need a new page
      tableRow = checkNewPage(tableRow, 50);

      // If this is a new page, add the table headers again
      if (tableRow === 50) {
        // Draw table header background
        doc.fillColor('#4e73df').rect(50, tableRow, doc.page.width - 100, 20).fill();

        // Add table headers with white text (same as original headers)
        doc.fillColor('#ffffff');
        doc.fontSize(10).text('ORDER ID', orderIdX, tableRow + 5);
        doc.fontSize(10).text('DATE', dateX, tableRow + 5);
        doc.fontSize(10).text('CUSTOMER', customerX, tableRow + 5);
        doc.fontSize(10).text('PAYMENT', paymentX, tableRow + 5);
        doc.fontSize(10).text('AMOUNT', amountX, tableRow + 5);
        doc.fontSize(10).text('STATUS', statusX, tableRow + 5);

        // Reset fill color for table content
        doc.fillColor('#000000');

        tableRow += 20;
      }

      // Add alternating row background (height increased to match row height)
      if (orderRowCount % 2 === 0) {
        doc.fillColor('#f8f9fc').rect(50, tableRow, doc.page.width - 100, 30).fill();
      }
      doc.fillColor('#000000'); // Reset text color

      // Use the display-friendly order ID (shorter format with only 5 digits)
      const truncatedOrderId = order.displayOrderId || order.orderNumber || `MK${order.orderId.toString().slice(-5)}`;

      const truncatedCustomerName = order.customerName.length > 15 ?
        order.customerName.substring(0, 12) + '...' : order.customerName;

      // Format payment method nicely
      let paymentMethodText = 'Unknown';
      if (order.paymentMethod === 'cod') paymentMethodText = 'COD';
      else if (order.paymentMethod === 'razorpay') paymentMethodText = 'Razorpay';
      else if (order.paymentMethod === 'wallet') paymentMethodText = 'Wallet';
      else paymentMethodText = order.paymentMethod.toUpperCase();

      // Add row data with consistent spacing and increased width for order ID
      // Adjusted vertical position to center text in taller rows
      doc.fontSize(9).text(truncatedOrderId, orderIdX, tableRow + 10, { width: 90 });
      doc.fontSize(9).text(moment(order.orderDate).format('DD-MM-YYYY'), dateX, tableRow + 10, { width: 70 });
      doc.fontSize(9).text(truncatedCustomerName, customerX, tableRow + 10, { width: 90 });
      doc.fontSize(9).text(paymentMethodText, paymentX, tableRow + 10, { width: 70 });
      doc.fontSize(9).text(formatCurrency(order.finalAmount), amountX, tableRow + 10, { width: 60 });

      // Determine overall status
      let overallStatus = 'Mixed';
      if (order.items.every(item => item.status === 'Delivered')) {
        overallStatus = 'Delivered';
      } else if (order.items.every(item => item.status === 'Cancelled')) {
        overallStatus = 'Cancelled';
      } else if (order.items.every(item => item.status === 'Processing')) {
        overallStatus = 'Processing';
      } else if (order.items.every(item => item.status === 'Shipped')) {
        overallStatus = 'Shipped';
      }

      // Add status with color coding
      let statusColor = '#6c757d'; // Default gray for Mixed
      if (overallStatus === 'Delivered') statusColor = '#28a745'; // Green
      else if (overallStatus === 'Cancelled') statusColor = '#dc3545'; // Red
      else if (overallStatus === 'Processing') statusColor = '#007bff'; // Blue
      else if (overallStatus === 'Shipped') statusColor = '#17a2b8'; // Cyan

      doc.fillColor(statusColor).text(overallStatus, statusX, tableRow + 10, { width: 70 });
      doc.fillColor('#000000'); // Reset text color

      // Add more space between rows (increased for better readability)
      tableRow += 30;
      orderRowCount++;
    });

    // Add a border around the entire table
    doc.strokeColor('#d1d3e2').lineWidth(1)
       .rect(50, tableTop, doc.page.width - 100, tableRow - tableTop)
       .stroke();

    // Generate timestamp once to ensure consistency across pages
    const timestamp = moment().format('DD MMM YYYY, HH:mm:ss');

    // Add footer to all pages using buffered pages
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      // Add page border with rounded corners
      doc.strokeColor('#d1d3e2').lineWidth(1)
         .roundedRect(50, 50, doc.page.width - 100, doc.page.height - 100, 5)
         .stroke();

      // Add footer background
      doc.fillColor('#f8f9fc')
         .rect(50, doc.page.height - 70, doc.page.width - 100, 20)
         .fill();

      // Add footer with page number and timestamp
      doc.fillColor('#4e73df')
         .fontSize(8)
         .text(
           `MANGEYKO SALES REPORT`,
           50,
           doc.page.height - 65,
           { align: 'left', width: 200 }
         );

      doc.fillColor('#666666')
         .fontSize(8)
         .text(
           `Page ${i + 1} of ${totalPages} | Generated on ${timestamp}`,
           50,
           doc.page.height - 65,
           { align: 'right', width: doc.page.width - 100 }
         );

      // Add a small logo or watermark at the bottom center
      doc.fillColor('#e8e8e8')
         .fontSize(16)
         .text(
           'MANGEYKO',
           0,
           doc.page.height - 100,
           { align: 'center', width: doc.page.width, opacity: 0.3 }
         );
    }

    // Finalize the PDF and end the stream
    doc.end();

  } catch (error) {
    console.error("Error generating PDF sales report:", error);
    // Render the error page instead of sending a plain text response
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/admin-error", {
      message: "Failed to generate PDF sales report",
      activePage: "reports"
    });
  }
};

// Export all functions
module.exports = {
  renderSalesReport: exports.renderSalesReport,
  getSalesReportOrders: exports.getSalesReportOrders,
  getSalesReportProducts: exports.getSalesReportProducts,
  downloadSalesReport: exports.downloadSalesReport,
  downloadSalesReportPDF: exports.downloadSalesReportPDF
};