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

    const filter = req.query.filter || 'custom';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const sortBy = req.query.sortBy || 'date';
    const sortOrder = req.query.sortOrder || 'desc';
    const productsSortBy = req.query.productsSortBy || 'revenue';
    const productsSortOrder = req.query.productsSortOrder || 'desc';

    const page = Math.max(parseInt(req.query.page) || 1, 1); // Ensure page is at least 1
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const productsPage = Math.max(parseInt(req.query.productsPage) || 1, 1);
    const productsLimit = parseInt(req.query.productsLimit) || 5;
    const productsSkip = (productsPage - 1) * productsLimit;

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

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid date format");
        }
      } catch (error) {
        console.error("Date parsing error:", error);
        startDate = moment().subtract(30, 'days').startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
      }
    }
    let matchStage = { orderDate: { $gte: startDate, $lte: endDate } };

    if (paymentMethod !== 'all') {
      matchStage.paymentMethod = paymentMethod;
    }

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

    const [orders, countResult, summaryResult, paymentMethodData, topProducts, topProductsCountResult, statusDistribution] = await Promise.all([
      Order.aggregate(ordersPipeline),
      Order.aggregate(countPipeline),
      Order.aggregate(summaryPipeline),
      Order.aggregate(paymentMethodPipeline),
      Order.aggregate(topProductsPipeline),
      Order.aggregate(topProductsCountPipeline),
      Order.aggregate(statusDistributionPipeline)
    ]);

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

    const totalItems = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalItems / limit);

    const totalProductItems = topProductsCountResult.length > 0 ? topProductsCountResult[0].total : 0;
    const totalProductPages = Math.ceil(totalProductItems / productsLimit);

    const formattedStatusDistribution = statusDistribution.map(status => ({
      status: status._id || 'Unknown',
      count: status.count,
      revenue: status.revenue
    }));

    const salesByDateMap = {};
    const dateFormat = 'YYYY-MM-DD';

    let currentDate = moment(startDate);
    const endMoment = moment(endDate);

    while (currentDate.isSameOrBefore(endMoment)) {
      const dateKey = currentDate.format(dateFormat);
      salesByDateMap[dateKey] = 0;
      currentDate.add(1, 'days');
    }

    orders.forEach(order => {
      const orderDate = moment(order.orderDate).format(dateFormat);
      if (salesByDateMap[orderDate] !== undefined) {
        salesByDateMap[orderDate] += order.finalAmount || 0;
      }
    });

    const salesByPaymentMethod = {
      cod: 0,
      razorpay: 0,
      wallet: 0
    };

    Object.keys(paymentSummary).forEach(method => {
      if (salesByPaymentMethod[method] !== undefined) {
        salesByPaymentMethod[method] = paymentSummary[method].total || 0;
      }
    });

    const offerSummary = {
      productOffers: { count: 0, savings: 0 },
      categoryOffers: { count: 0, savings: 0 },
      coupons: { count: 0, savings: 0 },
      totalSavings: summary.totalDiscount || 0
    };

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

    orders.forEach(order => {
      if (order.couponApplied && order.coupon) {
        offerSummary.coupons.count++;

        if (order.discount > 0) {
          offerSummary.coupons.savings += order.discount;
        }
      }
    });

    offerSummary.totalSavings =
      offerSummary.productOffers.savings +
      offerSummary.categoryOffers.savings +
      offerSummary.coupons.savings;

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

    if (renderData.isAjaxRequest) {


      res.render("admin/admin-sales-report", renderData);
    } else {

      res.render("admin/admin-sales-report", renderData);
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/admin-error", {
      message: "Failed to generate sales report",
      activePage: "reports"
    });
  }
};

//=================================================================================================
// Get Sales Report Orders
//=================================================================================================
// This function gets the sales report orders with pagination.
// It displays the sales report orders in the sales report orders page.
//=================================================================================================
exports.getSalesReportOrders = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filter = req.query.filter || 'custom';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const sortBy = req.query.sortBy || 'date';
    const sortOrder = req.query.sortOrder || 'desc';

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

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

    let matchStage = { orderDate: { $gte: startDate, $lte: endDate } };
    if (paymentMethod !== 'all') {
      matchStage.paymentMethod = paymentMethod;
    }

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

    const countPipeline = [
      { $match: matchStage },
      ...(orderStatus !== 'all' ? [
        { $unwind: "$orderedItems" },
        { $match: { "orderedItems.status": orderStatus } },
        { $group: { _id: "$_id" } }
      ] : []),
      { $count: "total" }
    ];

    const [orders, countResult] = await Promise.all([
      Order.aggregate(ordersPipeline),
      Order.aggregate(countPipeline)
    ]);

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
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

//=================================================================================================
// Get Sales Report Products
//=================================================================================================
// This function gets the sales report products with pagination.
// It displays the sales report products in the sales report products page.
//=================================================================================================
exports.getSalesReportProducts = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filter = req.query.filter || 'custom';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const productsSortBy = req.query.productsSortBy || 'revenue';
    const productsSortOrder = req.query.productsSortOrder || 'desc';

    const productsPage = Math.max(parseInt(req.query.page) || 1, 1);
    const productsLimit = parseInt(req.query.limit) || 5;
    const productsSkip = (productsPage - 1) * productsLimit;

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

    let matchStage = { orderDate: { $gte: startDate, $lte: endDate } };
    if (paymentMethod !== 'all') {
      matchStage.paymentMethod = paymentMethod;
    }

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

    const [topProducts, topProductsCountResult] = await Promise.all([
      Order.aggregate(topProductsPipeline),
      Order.aggregate(topProductsCountPipeline)
    ]);

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

//=================================================================================================
// Download Sales Report
//=================================================================================================
// This function downloads the sales report as a CSV file.
// It generates a CSV file and sends it to the client.
//=================================================================================================
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate and download sales report as CSV
 */
exports.downloadSalesReport = async (req, res) => {
  try {
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    const filter = req.query.filter || 'custom';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const sortBy = req.query.sortBy || 'date';
    const sortOrder = req.query.sortOrder || 'desc';

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

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid date format");
        }
      } catch (error) {
        console.error("Date parsing error:", error);
        startDate = moment().subtract(30, 'days').startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
      }
    }
    let matchStage = { orderDate: { $gte: startDate, $lte: endDate } };

    if (paymentMethod !== 'all') {
      matchStage.paymentMethod = paymentMethod;
    }

    const csvPipeline = [
      { $match: matchStage },
      { $unwind: "$orderedItems" },

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

    const orderItems = await Order.aggregate(csvPipeline);
    let csvContent = "Order ID,Date,Customer,Email,Payment Method,Payment Status,Product,Category,Quantity,Original Price,Discounted Price,Discount Amount,Status,Total Amount\n";

    orderItems.forEach(item => {

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

    const totalQuantity = orderItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalAmount = orderItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0).toFixed(2);
    const totalDiscount = orderItems.reduce((sum, item) => sum + (item.totalDiscount || 0), 0).toFixed(2);

    csvContent += `\n"TOTAL","","","","","","","","${totalQuantity}","","","${totalDiscount}","","${totalAmount}"\n`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.csv`);

    res.send(csvContent);
  } catch (error) {
    console.error("Error downloading sales report CSV:", error);

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
    const adminId = req.session.admin;
    if (!adminId) {
      return res.status(StatusCodes.UNAUTHORIZED).redirect("/admin/login");
    }

    const filter = req.query.filter || 'custom';
    const paymentMethod = req.query.paymentMethod || 'all';
    const orderStatus = req.query.orderStatus || 'all';
    const sortBy = req.query.sortBy || 'date';
    const sortOrder = req.query.sortOrder || 'desc';

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

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid date format");
        }
      } catch (error) {
        console.error("Date parsing error:", error);
        startDate = moment().subtract(30, 'days').startOf('day').toDate();
        endDate = moment().endOf('day').toDate();
      }
    }

    let matchStage = { orderDate: { $gte: startDate, $lte: endDate } };

    if (paymentMethod !== 'all') {
      matchStage.paymentMethod = paymentMethod;
    }

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

    const offerSummary = {
      productOffers: { count: 0, savings: 0 },
      categoryOffers: { count: 0, savings: 0 },
      coupons: { count: 0, savings: 0 },
      totalSavings: summary.totalDiscount || 0
    };

    const productsWithOffers = new Map();

    orders.forEach(order => {

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

      if (order.couponApplied && order.coupon) {
        offerSummary.coupons.count++;

        if (order.discount > 0) {
          offerSummary.coupons.savings += order.discount;
        }
      }
    });

    productsWithOffers.forEach(product => {
      if (product.offerType === 'product') {
        offerSummary.productOffers.count++;
        offerSummary.productOffers.savings += product.totalDiscount;
      } else if (product.offerType === 'category') {
        offerSummary.categoryOffers.count++;
        offerSummary.categoryOffers.savings += product.totalDiscount;
      }
    });

    offerSummary.totalSavings =
      offerSummary.productOffers.savings +
      offerSummary.categoryOffers.savings +
      offerSummary.coupons.savings;

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

    let pageNumber = 1;
    doc.on('pageAdded', () => {
      pageNumber++;
    });

    const checkNewPage = (currentY, neededSpace = 150) => {
      if (currentY + neededSpace > doc.page.height - 100) {
        doc.addPage();
        return 50; // Return the Y position for the new page
      }
      return currentY;
    };

    const formatCurrency = (amount) => {
      // Handle undefined, null, or non-numeric values
      if (amount === undefined || amount === null || isNaN(amount)) {
        amount = 0;
      }

      // Convert to number and ensure it's valid
      const numAmount = parseFloat(amount) || 0;

      // Simple formatting with fixed decimal places
      const formatted = numAmount.toFixed(2);

      // Add thousand separators manually
      const parts = formatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

      return '₹' + parts.join('.');
    };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=mangeyko-sales-report-${moment(startDate).format('YYYY-MM-DD')}-to-${moment(endDate).format('YYYY-MM-DD')}.pdf`);

    doc.pipe(res);

    doc.fontSize(22).fillColor('#333333').text('MANGEYKO', { align: 'center' });
    doc.fontSize(10).fillColor('#666666').text('E-Commerce Sales Report', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(16).fillColor('#000000').text('SALES REPORT', { align: 'center' });
    doc.fontSize(12).fillColor('#666666').text(`Period: ${moment(startDate).format('DD MMM YYYY')} to ${moment(endDate).format('DD MMM YYYY')}`, { align: 'center' });

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

    doc.strokeColor('#4e73df').lineWidth(2)
       .moveTo(50, doc.y)
       .lineTo(doc.page.width - 50, doc.y)
       .stroke();
    doc.moveDown(1.5);

    doc.fontSize(14).fillColor('#4e73df').text('SALES SUMMARY', { underline: false });
    doc.moveDown(0.5);

    const boxTop = doc.y;
    const boxHeight = 140;

    doc.fillColor('#f8f9fc').roundedRect(50, boxTop, doc.page.width - 100, boxHeight, 5).fill();
    doc.fillColor('#000000'); // Reset text color

    const col1X = 70;
    const col2X = doc.page.width / 2 + 20;
    let currentY = boxTop + 15;

    // Use the exact same calculation logic as the web report
    const netAmount = summary.totalSales || 0;
    const backendGross = summary.totalOriginalValue || 0;
    const backendDiscount = summary.totalDiscount || 0;

    // If backend gross is less than net, calculate gross as net + discount
    const summaryGrossRevenue = backendGross >= netAmount ? backendGross : (netAmount + Math.abs(backendDiscount));
    const netRevenue = netAmount;

    // Calculate discount as the difference between gross and net (same as web report)
    const totalDiscounts = summaryGrossRevenue - netAmount;

    // Debug logging to understand the calculations
    console.log('PDF Sales Report Calculations:');
    console.log('- Summary totalOriginalValue:', summary.totalOriginalValue);
    console.log('- Summary totalSales (net):', summary.totalSales);
    console.log('- Summary totalDiscount:', summary.totalDiscount);
    console.log('- Backend gross:', backendGross);
    console.log('- Backend discount:', backendDiscount);
    console.log('- Calculated summaryGrossRevenue:', summaryGrossRevenue);
    console.log('- Calculated netRevenue:', netRevenue);
    console.log('- Calculated totalDiscounts:', totalDiscounts);
    console.log('- Orders count for calculation:', orders.length);

    // Left column - Main financial metrics (matching web report order)
    doc.fontSize(10).fillColor('#666666').text(`Gross Revenue:`, col1X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${formatCurrency(summaryGrossRevenue)}`, col1X + 120, currentY, { align: 'left' });
    doc.fontSize(8).fillColor('#999999').text(`Before discounts & offers`, col1X, currentY + 12);
    currentY += 25;

    doc.fontSize(10).fillColor('#666666').text(`Total Discounts:`, col1X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${formatCurrency(totalDiscounts)}`, col1X + 120, currentY, { align: 'left' });
    if (summaryGrossRevenue > 0) {
      const discountPercentage = Math.round((totalDiscounts / summaryGrossRevenue) * 100);
      doc.fontSize(8).fillColor('#999999').text(`${discountPercentage}% of gross revenue`, col1X, currentY + 12);
    }
    currentY += 25;

    doc.fontSize(10).fillColor('#666666').text(`Net Revenue:`, col1X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${formatCurrency(netRevenue)}`, col1X + 120, currentY, { align: 'left' });
    doc.fontSize(8).fillColor('#999999').text(`After discounts & offers`, col1X, currentY + 12);
    currentY += 25;

    // Right column - Order metrics
    currentY = boxTop + 15;

    doc.fontSize(10).fillColor('#666666').text(`Total Orders:`, col2X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${summary.totalOrders}`, col2X + 120, currentY, { align: 'left' });
    doc.fontSize(8).fillColor('#999999').text(`${summary.totalProducts} products sold`, col2X, currentY + 12);
    currentY += 25;

    // Calculate average order value based on net revenue (like web report)
    const avgOrderValue = summary.totalOrders > 0 ? (netRevenue / summary.totalOrders) : 0;
    doc.fontSize(10).fillColor('#666666').text(`Average Order Value:`, col2X, currentY);
    doc.fontSize(10).fillColor('#000000').text(`${formatCurrency(avgOrderValue)}`, col2X + 120, currentY, { align: 'left' });
    doc.fontSize(8).fillColor('#999999').text(`Net revenue per order`, col2X, currentY + 12);
    currentY += 25;

    doc.y = boxTop + boxHeight + 20;

    doc.y = checkNewPage(doc.y, 150);

    doc.fontSize(14).fillColor('#4e73df').text('PAYMENT METHODS BREAKDOWN', { underline: false });
    doc.moveDown(0.5);

    const methodTableTop = doc.y;
    const methodX = 70;
    const countX = 220;
    const totalX = 320;
    const avgX = 450;

    doc.fillColor('#4e73df').rect(50, methodTableTop, doc.page.width - 100, 20).fill();

    doc.fillColor('#ffffff');
    doc.fontSize(10).text('METHOD', methodX, methodTableTop + 5, { bold: true });
    doc.fontSize(10).text('ORDERS', countX, methodTableTop + 5, { bold: true });
    doc.fontSize(10).text('AMOUNT', totalX, methodTableTop + 5, { bold: true });
    doc.fontSize(10).text('AVG. ORDER', avgX, methodTableTop + 5, { bold: true });

    doc.fillColor('#000000');

    let methodY = methodTableTop + 20;
    let rowCount = 0;

    Object.keys(paymentSummary).forEach((method, index) => {
      const data = paymentSummary[method];
      const avg = data.count > 0 ? data.total / data.count : 0;

      methodY = checkNewPage(methodY, 30);

      if (rowCount % 2 === 0) {
        doc.fillColor('#f8f9fc').rect(50, methodY, doc.page.width - 100, 20).fill();
      }
      doc.fillColor('#000000'); // Reset text color

      // Format method names to match web report
      let methodName = 'Unknown';
      if (method === 'cod') methodName = 'Cash on Delivery';
      else if (method === 'razorpay') methodName = 'Razorpay';
      else if (method === 'wallet') methodName = 'Wallet';
      else methodName = method.charAt(0).toUpperCase() + method.slice(1);

      doc.fontSize(10).text(methodName, methodX, methodY + 5);
      doc.fontSize(10).text(`${data.count}`, countX, methodY + 5);
      doc.fontSize(10).text(`${formatCurrency(data.total)}`, totalX, methodY + 5);
      doc.fontSize(10).text(`${formatCurrency(avg)}`, avgX, methodY + 5);

      methodY += 20;
      rowCount++;
    });

    methodY = checkNewPage(methodY, 30);

    // Gross Total Row
    doc.fillColor('#e8f4f8').rect(50, methodY, doc.page.width - 100, 25).fill();
    doc.fillColor('#000000'); // Reset text color

    const totalCount = Object.values(paymentSummary).reduce((sum, data) => sum + data.count, 0);
    const totalAmount = Object.values(paymentSummary).reduce((sum, data) => sum + data.total, 0);
    // Use the same gross revenue calculation as in summary section
    const paymentGrossRevenue = summaryGrossRevenue;
    const grossAvg = totalCount > 0 ? paymentGrossRevenue / totalCount : 0;

    doc.fontSize(10).font('Helvetica-Bold')
       .text('GROSS TOTAL', methodX, methodY + 7)
       .text(`${totalCount}`, countX, methodY + 7)
       .text(`${formatCurrency(paymentGrossRevenue)}`, totalX, methodY + 7)
       .text(`${formatCurrency(grossAvg)}`, avgX, methodY + 7);

    methodY += 25;

    // Total Discounts Row (if applicable)
    const paymentTotalDiscounts = paymentGrossRevenue - totalAmount;
    if (paymentTotalDiscounts > 0) {
      methodY = checkNewPage(methodY, 30);

      doc.fillColor('#fff3cd').rect(50, methodY, doc.page.width - 100, 25).fill();
      doc.fillColor('#000000'); // Reset text color

      doc.fontSize(10).font('Helvetica-Bold')
         .text('TOTAL DISCOUNTS', methodX, methodY + 7)
         .text('-', countX, methodY + 7)
         .text(`-${formatCurrency(paymentTotalDiscounts)}`, totalX, methodY + 7)
         .text('', avgX, methodY + 7);

      methodY += 25;
    }

    // Net Revenue Row
    methodY = checkNewPage(methodY, 30);

    doc.fillColor('#d1ecf1').rect(50, methodY, doc.page.width - 100, 25).fill();
    doc.fillColor('#000000'); // Reset text color

    const netAvg = totalCount > 0 ? totalAmount / totalCount : 0;

    doc.fontSize(10).font('Helvetica-Bold')
       .text('NET REVENUE', methodX, methodY + 7)
       .text(`${totalCount}`, countX, methodY + 7)
       .text(`${formatCurrency(totalAmount)}`, totalX, methodY + 7)
       .text(`${formatCurrency(netAvg)}`, avgX, methodY + 7);

    doc.font('Helvetica');

    doc.strokeColor('#d1d3e2').lineWidth(1)
       .rect(50, methodTableTop, doc.page.width - 100, methodY + 25 - methodTableTop)
       .stroke();

    doc.y = methodY + 35;

    doc.y = checkNewPage(doc.y, 150);

    doc.fontSize(14).fillColor('#4e73df').text('APPLIED FILTERS', { underline: false });
    doc.moveDown(0.5);

    const filterBoxTop = doc.y;
    const filterBoxHeight = 100;

    doc.fillColor('#f8f9fc').roundedRect(50, filterBoxTop, doc.page.width - 100, filterBoxHeight, 5).fill();
    doc.fillColor('#000000'); // Reset text color

    const filterY = filterBoxTop + 15;
    const filterLabelX = 70;
    const filterValueX = 220;
    const filterLabel2X = doc.page.width / 2 + 20;
    const filterValue2X = filterLabel2X + 150;

    doc.fontSize(10).fillColor('#666666').text('Date Range:', filterLabelX, filterY);
    doc.fontSize(10).fillColor('#000000').text(`${filter === 'custom' ? 'Custom' : filter.charAt(0).toUpperCase() + filter.slice(1)}`, filterValueX, filterY);

    doc.fontSize(10).fillColor('#666666').text('Payment Method:', filterLabelX, filterY + 30);
    doc.fontSize(10).fillColor('#000000').text(`${paymentMethod === 'all' ? 'All Methods' : paymentMethod.toUpperCase()}`, filterValueX, filterY + 30);

    doc.fontSize(10).fillColor('#666666').text('Order Status:', filterLabel2X, filterY);
    doc.fontSize(10).fillColor('#000000').text(`${orderStatus === 'all' ? 'All Statuses' : orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1)}`, filterValue2X, filterY);

    doc.fontSize(10).fillColor('#666666').text('Sort By:', filterLabel2X, filterY + 30);
    doc.fontSize(10).fillColor('#000000').text(`${sortBy === 'date' ? 'Date' : 'Amount'} (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`, filterValue2X, filterY + 30);

    doc.fontSize(8).fillColor('#666666')
       .text('Note: This report shows data filtered according to the criteria above. For a complete report, reset all filters.',
             70, filterY + 60, { width: doc.page.width - 140, align: 'center' });

    doc.y = filterBoxTop + filterBoxHeight + 20;

    if (topProducts && Array.isArray(topProducts) && topProducts.length > 0) {
      doc.y = checkNewPage(doc.y, 200);

      doc.fontSize(14).fillColor('#4e73df').text('TOP SELLING PRODUCTS', { underline: false });
      doc.moveDown(0.5);

      const productsTableTop = doc.y;
      const rankX = 60;
      const productX = 90;
      const categoryX = 230;
      const quantityX = 310;
      const priceX = 360;
      const revenueX = 430;
      const originalX = 500;

      doc.fillColor('#4e73df').rect(50, productsTableTop, doc.page.width - 100, 20).fill();

      doc.fillColor('#ffffff');
      doc.fontSize(10).text('RANK', rankX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('PRODUCT', productX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('CATEGORY', categoryX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('QTY', quantityX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('UNIT PRICE', priceX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('REVENUE', revenueX, productsTableTop + 5, { bold: true });
      doc.fontSize(10).text('ORIGINAL', originalX, productsTableTop + 5, { bold: true });

      doc.fillColor('#000000');

      let productY = productsTableTop + 20;

      topProducts.forEach((product, index) => {

        if (!product) return;

        productY = checkNewPage(productY, 30);

        if (index % 2 === 0) {
          doc.fillColor('#f8f9fc').rect(50, productY, doc.page.width - 100, 25).fill();
        }
        doc.fillColor('#000000'); // Reset text color

        const productName = product.name || product.productName || 'Unknown Product';
        const truncatedName = productName.length > 25 ?
          productName.substring(0, 22) + '...' : productName;

        const categoryName = product.category || 'Uncategorized';

        const originalPrice = product.originalPrice || 0;
        const quantity = product.quantity || 0;
        const revenue = product.revenue || 0;
        const discountedPrice = quantity > 0 ? revenue / quantity : 0;
        const productOriginalAmount = originalPrice * quantity;

        const offerPercentage = product.offerPercentage || 0;
        const priceDisplay = formatCurrency(discountedPrice);

        doc.fontSize(9).text(`#${index + 1}`, rankX, productY + 7);
        doc.fontSize(9).text(truncatedName, productX, productY + 7, { width: 130 });
        doc.fontSize(9).text(categoryName, categoryX, productY + 7, { width: 70 });
        doc.fontSize(9).text(`${quantity}`, quantityX, productY + 7, { width: 40 });
        doc.fontSize(9).text(priceDisplay, priceX, productY + 7, { width: 60 });
        doc.fontSize(9).text(formatCurrency(revenue), revenueX, productY + 7, { width: 60 });
        doc.fontSize(9).text(formatCurrency(productOriginalAmount), originalX, productY + 7, { width: 60 });

        productY += 25;
      });

      doc.strokeColor('#d1d3e2').lineWidth(1)
         .rect(50, productsTableTop, doc.page.width - 100, productY - productsTableTop)
         .stroke();

      doc.y = productY + 20;
    }

    if (offerSummary && (offerSummary.productOffers.count > 0 || offerSummary.categoryOffers.count > 0 || offerSummary.coupons.count > 0)) {
      doc.y = checkNewPage(doc.y, 180);

      doc.fontSize(14).fillColor('#4e73df').text('OFFERS & DISCOUNTS', { underline: false });
      doc.moveDown(0.5);

      const offerTableTop = doc.y;
      const offerTypeX = 70;
      const offerCountX = 250;
      const offerSavingsX = 350;
      const offerPercentX = 450;

      doc.fillColor('#4e73df').rect(50, offerTableTop, doc.page.width - 100, 20).fill();

      doc.fillColor('#ffffff');
      doc.fontSize(10).text('OFFER TYPE', offerTypeX, offerTableTop + 5, { bold: true });
      doc.fontSize(10).text('PRODUCTS', offerCountX, offerTableTop + 5, { bold: true });
      doc.fontSize(10).text('SAVINGS', offerSavingsX, offerTableTop + 5, { bold: true });
      doc.fontSize(10).text('% OF TOTAL', offerPercentX, offerTableTop + 5, { bold: true });

      doc.fillColor('#000000');

      let offerY = offerTableTop + 20;

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

      doc.font('Helvetica');

      doc.strokeColor('#d1d3e2').lineWidth(1)
         .rect(50, offerTableTop, doc.page.width - 100, offerY + 25 - offerTableTop)
         .stroke();

      doc.y = offerY + 35;
    }

    doc.y = checkNewPage(doc.y, 200);

    doc.fontSize(14).fillColor('#4e73df').text('ORDER DETAILS', { underline: false });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const orderIdX = 60;
    const dateX = 160;
    const customerX = 240;
    const paymentX = 340;
    const amountX = 420;
    const statusX = 490;

    doc.fillColor('#4e73df').rect(50, tableTop, doc.page.width - 100, 20).fill();

    doc.fillColor('#ffffff');
    doc.fontSize(10).text('ORDER ID', orderIdX, tableTop + 5);
    doc.fontSize(10).text('DATE', dateX, tableTop + 5);
    doc.fontSize(10).text('CUSTOMER', customerX, tableTop + 5);
    doc.fontSize(10).text('PAYMENT', paymentX, tableTop + 5);
    doc.fontSize(10).text('AMOUNT', amountX, tableTop + 5);
    doc.fontSize(10).text('STATUS', statusX, tableTop + 5);

    doc.fillColor('#000000');

    let tableRow = tableTop + 20;

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

    let orderRowCount = 0;
    Object.values(groupedOrders).forEach((order, index) => {

      tableRow = checkNewPage(tableRow, 50);

      if (tableRow === 50) {

        doc.fillColor('#4e73df').rect(50, tableRow, doc.page.width - 100, 20).fill();

        doc.fillColor('#ffffff');
        doc.fontSize(10).text('ORDER ID', orderIdX, tableRow + 5);
        doc.fontSize(10).text('DATE', dateX, tableRow + 5);
        doc.fontSize(10).text('CUSTOMER', customerX, tableRow + 5);
        doc.fontSize(10).text('PAYMENT', paymentX, tableRow + 5);
        doc.fontSize(10).text('AMOUNT', amountX, tableRow + 5);
        doc.fontSize(10).text('STATUS', statusX, tableRow + 5);

        doc.fillColor('#000000');

        tableRow += 20;
      }

      if (orderRowCount % 2 === 0) {
        doc.fillColor('#f8f9fc').rect(50, tableRow, doc.page.width - 100, 30).fill();
      }
      doc.fillColor('#000000'); // Reset text color

      const truncatedOrderId = order.displayOrderId || order.orderNumber || `MK${order.orderId.toString().slice(-5)}`;

      const truncatedCustomerName = order.customerName.length > 15 ?
        order.customerName.substring(0, 12) + '...' : order.customerName;

      let paymentMethodText = 'Unknown';
      if (order.paymentMethod === 'cod') paymentMethodText = 'COD';
      else if (order.paymentMethod === 'razorpay') paymentMethodText = 'Razorpay';
      else if (order.paymentMethod === 'wallet') paymentMethodText = 'Wallet';
      else paymentMethodText = order.paymentMethod.toUpperCase();


      doc.fontSize(9).text(truncatedOrderId, orderIdX, tableRow + 10, { width: 90 });
      doc.fontSize(9).text(moment(order.orderDate).format('DD-MM-YYYY'), dateX, tableRow + 10, { width: 70 });
      doc.fontSize(9).text(truncatedCustomerName, customerX, tableRow + 10, { width: 90 });
      doc.fontSize(9).text(paymentMethodText, paymentX, tableRow + 10, { width: 70 });
      doc.fontSize(9).text(formatCurrency(order.finalAmount), amountX, tableRow + 10, { width: 60 });

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

      let statusColor = '#6c757d'; // Default gray for Mixed
      if (overallStatus === 'Delivered') statusColor = '#28a745'; // Green
      else if (overallStatus === 'Cancelled') statusColor = '#dc3545'; // Red
      else if (overallStatus === 'Processing') statusColor = '#007bff'; // Blue
      else if (overallStatus === 'Shipped') statusColor = '#17a2b8'; // Cyan

      doc.fillColor(statusColor).text(overallStatus, statusX, tableRow + 10, { width: 70 });
      doc.fillColor('#000000'); // Reset text color

      tableRow += 30;
      orderRowCount++;
    });

    doc.strokeColor('#d1d3e2').lineWidth(1)
       .rect(50, tableTop, doc.page.width - 100, tableRow - tableTop)
       .stroke();

    const timestamp = moment().format('DD MMM YYYY, HH:mm:ss');

    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      doc.strokeColor('#d1d3e2').lineWidth(1)
         .roundedRect(50, 50, doc.page.width - 100, doc.page.height - 100, 5)
         .stroke();

      doc.fillColor('#f8f9fc')
         .rect(50, doc.page.height - 70, doc.page.width - 100, 20)
         .fill();

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

      doc.fillColor('#e8e8e8')
         .fontSize(16)
         .text(
           'MANGEYKO',
           0,
           doc.page.height - 100,
           { align: 'center', width: doc.page.width, opacity: 0.3 }
         );
    }

    doc.end();

  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/admin-error", {
      message: "Failed to generate PDF sales report",
      activePage: "reports"
    });
  }
};

//=================================================================================================
// Module Exports
//=================================================================================================
// This exports the report controller functions.
// It exports the report controller functions to be used in the admin routes.
//=================================================================================================
module.exports = {
  renderSalesReport: exports.renderSalesReport,
  getSalesReportOrders: exports.getSalesReportOrders,
  getSalesReportProducts: exports.getSalesReportProducts,
  downloadSalesReport: exports.downloadSalesReport,
  downloadSalesReportPDF: exports.downloadSalesReportPDF
};
