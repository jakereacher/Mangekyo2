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
      {
        $group: {
          _id: "$orderedItems.product",
          name: { $first: "$productDetails.productName" },
          image: { $first: { $arrayElemAt: ["$productDetails.productImage", 0] } },
          quantity: { $sum: "$orderedItems.quantity" },
          revenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
          originalPrice: { $first: "$productDetails.price" },
          offerPercentage: { $first: "$productDetails.offerPercentage" },
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

      return {
        _id: order._id,
        orderId: order.orderId || order._id.toString().slice(-6).toUpperCase(),
        orderNumber: order.orderNumber, // Include the order number for display
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

    // Prepare data for rendering
    const renderData = {
      orders: formattedOrders,
      summary,
      paymentSummary,
      topProducts,
      statusDistribution: formattedStatusDistribution,
      filters: {
        filter,
        startDate: moment(startDate).format('YYYY-MM-DD'),
        endDate: moment(endDate).format('YYYY-MM-DD'),
        paymentMethod,
        orderStatus,
        sortBy,
        sortOrder
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
      res.render("admin-sales-report-new", renderData);
    } else {
      // For regular requests, render the full page
      res.render("admin-sales-report-new", renderData);
    }
  } catch (error) {
    console.error("Error generating sales report:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/error", {
      message: "Failed to generate sales report",
      activePage: "reports"
    });
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
      const orderId = item.orderId || item._id.toString().slice(-6).toUpperCase();
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
    // Send a simple error response
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Failed to generate CSV sales report. Please try again later.");
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

    // Create a new PDF document with better margins and layout
    const doc = new PDFDocument({
      margin: 50,
      autoFirstPage: true,
      size: 'A4',
      bufferPages: true // Enable buffer pages for page numbering
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

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment(startDate).format('YYYY-MM-DD')}-to-${moment(endDate).format('YYYY-MM-DD')}.pdf`);

    // Pipe the PDF to the response
    doc.pipe(res);

    // Add content to the PDF
    // Header with better spacing
    doc.fontSize(24).text('Mangeyko', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(18).text('Sales Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`, { align: 'center' });

    // Add a horizontal line after the header
    doc.moveDown(1);
    doc.moveTo(50, doc.y)
       .lineTo(doc.page.width - 50, doc.y)
       .stroke();
    doc.moveDown(1.5);

    // Summary section with better layout
    let currentY = doc.y;
    doc.fontSize(16).text('Summary', 50, currentY, { underline: true });
    doc.moveDown(1);
    currentY = doc.y;

    // Create a two-column layout for summary data
    const col1X = 50;
    const col2X = 300;

    // Column 1
    doc.fontSize(10).text(`Total Orders:`, col1X, currentY);
    doc.fontSize(10).text(`${summary.totalOrders}`, col1X + 150, currentY, { align: 'left' });
    currentY += 20;

    doc.fontSize(10).text(`Total Sales:`, col1X, currentY);
    doc.fontSize(10).text(`₹${summary.totalSales.toFixed(2)}`, col1X + 150, currentY, { align: 'left' });
    currentY += 20;

    doc.fontSize(10).text(`Total Products Sold:`, col1X, currentY);
    doc.fontSize(10).text(`${summary.totalProducts}`, col1X + 150, currentY, { align: 'left' });
    currentY += 20;

    doc.fontSize(10).text(`Total Discount:`, col1X, currentY);
    doc.fontSize(10).text(`₹${summary.totalDiscount.toFixed(2)}`, col1X + 150, currentY, { align: 'left' });

    // Reset Y position for column 2
    currentY = doc.y - 60;

    // Column 2
    doc.fontSize(10).text(`Average Order Value:`, col2X, currentY);
    doc.fontSize(10).text(`₹${summary.avgOrderValue.toFixed(2)}`, col2X + 150, currentY, { align: 'left' });
    currentY += 20;

    doc.fontSize(10).text(`Minimum Order Value:`, col2X, currentY);
    doc.fontSize(10).text(`₹${summary.minOrderValue.toFixed(2)}`, col2X + 150, currentY, { align: 'left' });
    currentY += 20;

    doc.fontSize(10).text(`Maximum Order Value:`, col2X, currentY);
    doc.fontSize(10).text(`₹${summary.maxOrderValue.toFixed(2)}`, col2X + 150, currentY, { align: 'left' });

    // Move down after the summary section
    doc.y = currentY + 40;

    // Check if we need a new page for payment methods
    doc.y = checkNewPage(doc.y, 150);

    // Payment Method Summary with table layout
    doc.fontSize(16).text('Payment Methods', { underline: true });
    doc.moveDown(1);

    // Create a table for payment methods
    const methodTableTop = doc.y;
    const methodX = 50;
    const countX = 250;
    const totalX = 400;

    // Table headers
    doc.fontSize(11).font('Helvetica-Bold').text('Payment Method', methodX, methodTableTop);
    doc.text('Order Count', countX, methodTableTop);
    doc.text('Total Amount', totalX, methodTableTop);
    doc.font('Helvetica'); // Reset to regular font

    // Add a line under headers
    doc.moveDown(0.5);
    const headerLineY = doc.y;
    doc.moveTo(methodX, headerLineY)
       .lineTo(doc.page.width - 50, headerLineY)
       .stroke();
    doc.moveDown(0.5);

    // Add payment method rows
    let methodY = doc.y;
    Object.keys(paymentSummary).forEach((method, index) => {
      const data = paymentSummary[method];

      // Check if we need a new page
      methodY = checkNewPage(methodY, 30);

      doc.fontSize(10).text(method.toUpperCase(), methodX, methodY);
      doc.text(`${data.count}`, countX, methodY);
      doc.text(`₹${data.total.toFixed(2)}`, totalX, methodY);

      methodY += 20;
    });

    // Add a line after the table
    doc.moveTo(methodX, methodY)
       .lineTo(doc.page.width - 50, methodY)
       .stroke();
    doc.y = methodY + 20;

    // Check if we need a new page for filters
    doc.y = checkNewPage(doc.y, 150);

    // Filter Information with better layout
    doc.fontSize(16).text('Applied Filters', { underline: true });
    doc.moveDown(1);

    // Create a two-column layout for filters
    const filterY = doc.y;
    const filterLabelX = 50;
    const filterValueX = 200;

    // Add filter information
    doc.fontSize(10).text('Date Range:', filterLabelX, filterY);
    doc.fontSize(10).text(`${filter === 'custom' ? 'Custom' : filter.charAt(0).toUpperCase() + filter.slice(1)}`, filterValueX, filterY);

    doc.fontSize(10).text('Payment Method:', filterLabelX, filterY + 20);
    doc.fontSize(10).text(`${paymentMethod === 'all' ? 'All' : paymentMethod.toUpperCase()}`, filterValueX, filterY + 20);

    doc.fontSize(10).text('Order Status:', filterLabelX, filterY + 40);
    doc.fontSize(10).text(`${orderStatus === 'all' ? 'All' : orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1)}`, filterValueX, filterY + 40);

    doc.fontSize(10).text('Sort By:', filterLabelX, filterY + 60);
    doc.fontSize(10).text(`${sortBy === 'date' ? 'Date' : 'Amount'} (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`, filterValueX, filterY + 60);

    // Move down after filters
    doc.y = filterY + 90;

    // Check if we need a new page for orders table
    doc.y = checkNewPage(doc.y, 200);

    // Orders Table with improved layout
    doc.fontSize(16).text('Order Details', { underline: true });
    doc.moveDown(1);

    // Table headers with better spacing
    const tableTop = doc.y;
    const orderIdX = 50;
    const dateX = 170;
    const customerX = 270;
    const amountX = 400;
    const statusX = 480;

    // Add bold headers
    doc.font('Helvetica-Bold');
    doc.fontSize(11).text('Order ID', orderIdX, tableTop);
    doc.fontSize(11).text('Date', dateX, tableTop);
    doc.fontSize(11).text('Customer', customerX, tableTop);
    doc.fontSize(11).text('Amount', amountX, tableTop);
    doc.fontSize(11).text('Status', statusX, tableTop);
    doc.font('Helvetica'); // Reset to regular font

    // Add a line under headers
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y)
       .lineTo(doc.page.width - 50, doc.y)
       .stroke();
    doc.moveDown(0.5);

    let tableRow = doc.y;

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

    // Add order rows with better spacing
    Object.values(groupedOrders).forEach((order, index) => {
      // Check if we need a new page
      tableRow = checkNewPage(tableRow, 50);

      // If this is a new page, add the table headers again
      if (tableRow === 50) {
        // Add bold headers
        doc.font('Helvetica-Bold');
        doc.fontSize(11).text('Order ID', orderIdX, tableRow);
        doc.fontSize(11).text('Date', dateX, tableRow);
        doc.fontSize(11).text('Customer', customerX, tableRow);
        doc.fontSize(11).text('Amount', amountX, tableRow);
        doc.fontSize(11).text('Status', statusX, tableRow);
        doc.font('Helvetica'); // Reset to regular font

        // Add a line under headers
        doc.moveDown(0.5);
        tableRow = doc.y;
        doc.moveTo(50, tableRow)
           .lineTo(doc.page.width - 50, tableRow)
           .stroke();

        tableRow += 15;
      }

      // Truncate long order IDs and customer names to prevent overlap
      const displayOrderId = (order.orderNumber || order.orderId).toString();
      const truncatedOrderId = displayOrderId.length > 15 ?
        displayOrderId.substring(0, 12) + '...' : displayOrderId;

      const truncatedCustomerName = order.customerName.length > 15 ?
        order.customerName.substring(0, 12) + '...' : order.customerName;

      // Add row data with consistent spacing
      doc.fontSize(9).text(truncatedOrderId, orderIdX, tableRow, { width: 110 });
      doc.fontSize(9).text(moment(order.orderDate).format('YYYY-MM-DD'), dateX, tableRow, { width: 90 });
      doc.fontSize(9).text(truncatedCustomerName, customerX, tableRow, { width: 120 });
      doc.fontSize(9).text(`₹${order.finalAmount.toFixed(2)}`, amountX, tableRow, { width: 70 });

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

      doc.fontSize(9).text(overallStatus, statusX, tableRow, { width: 70 });

      // Add more space between rows
      tableRow += 25;

      // Add a separator line between orders
      if (index < Object.values(groupedOrders).length - 1) {
        doc.moveTo(50, tableRow - 10)
           .lineTo(doc.page.width - 50, tableRow - 10)
           .stroke({ dash: [3, 3] });
      }
    });

    // Add a border at the bottom of the last page
    doc.moveTo(50, doc.page.height - 70)
       .lineTo(doc.page.width - 50, doc.page.height - 70)
       .stroke();

    // Generate timestamp once to ensure consistency across pages
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');

    // Add footer to all pages using buffered pages
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      // Add page border
      doc.rect(50, 50, doc.page.width - 100, doc.page.height - 100)
         .stroke();

      // Add footer with page number
      doc.fontSize(8)
         .text(
           `Page ${i + 1} of ${totalPages} - Generated on ${timestamp}`,
           50,
           doc.page.height - 50,
           { align: 'center' }
         );
    }

    // Finalize the PDF and end the stream
    doc.end();

  } catch (error) {
    console.error("Error generating PDF sales report:", error);
    // Send a simple error response instead of rendering a view
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Failed to generate PDF sales report. Please try again later.");
  }
};

// Export all functions
module.exports = {
  renderSalesReport: exports.renderSalesReport,
  downloadSalesReport: exports.downloadSalesReport,
  downloadSalesReportPDF: exports.downloadSalesReportPDF
};