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

    // Pagination parameters
    const page = Math.max(parseInt(req.query.page) || 1, 1); // Ensure page is at least 1
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

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
      { $limit: 5 }
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
    const [orders, countResult, summaryResult, paymentMethodData, topProducts, statusDistribution] = await Promise.all([
      Order.aggregate(ordersPipeline),
      Order.aggregate(countPipeline),
      Order.aggregate(summaryPipeline),
      Order.aggregate(paymentMethodPipeline),
      Order.aggregate(topProductsPipeline),
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

    // Format status distribution data
    const formattedStatusDistribution = statusDistribution.map(status => ({
      status: status._id || 'Unknown',
      count: status.count,
      revenue: status.revenue
    }));

    // Render the page with all data
    res.render("admin-sales-report-new", {
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
    console.error("Error downloading sales report:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to download sales report: " + error.message
    });
  }
};
