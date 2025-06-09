/**
 * CouponController
 */

const Coupon = require("../../models/couponSchema.js");
const StatusCodes = require("../../utils/httpStatusCodes");


//=================================================================================================
// Render Coupons Page
//=================================================================================================
// This function renders the coupons page.
// It renders the coupons page.
//================================================================================================= 
const renderCouponsPage = async (req, res) => {
  try {

    const coupons = await Coupon.find({
      isActive: true,
      isDelete: false,
    }).sort({ created_at: -1 });

    return res.render('coupons', {
      coupons,
      user: req.session.user // Pass user data if needed for the template
    });

  } catch (error) {
    console.error("Error rendering coupons page:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('error', {
      message: "Failed to load coupons page"
    });
  }
};


//=================================================================================================
// Get Coupon By Code
//=================================================================================================
// This function gets a coupon by code.
// It gets a coupon by code.
//=================================================================================================
const getCouponByCode = async (req, res) => {
  const { code } = req.params;

  try {

    const coupon = await Coupon.findOne({
      code,
      isActive: true,
      isDelete: false,
    });

    if (!coupon) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Coupon not found or expired",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Coupon fetched successfully",
      coupon,
    });
  } catch (error) {
    console.error("Error fetching coupon by code:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


//=================================================================================================
// Apply Coupon
//=================================================================================================
// This function applies a coupon to the cart.
// It applies a coupon to the cart.
//=================================================================================================
const applyCoupon = async (req, res) => {
  try {
    const { code, cartTotal, userId } = req.body;
    console.log(req.body); // For debugging purposes

    if (!code || !cartTotal || !userId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Coupon code, cart total, and user ID are required to apply a coupon.",
        missingFields: {
          code: !code,
          cartTotal: !cartTotal,
          userId: !userId,
        },
        errorType: "MISSING_FIELDS"
      });
    }

    const numericCartTotal = Number(cartTotal);
    if (isNaN(numericCartTotal) || numericCartTotal <= 0) {
      console.log("Invalid cart total value:", cartTotal);
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "The cart total value is invalid. Please refresh the page and try again.",
        errorType: "INVALID_CART_VALUE"
      });
    }

    const coupon = await Coupon.findOne({
      code,
      isActive: true,
      isDelete: false,
      startDate: { $lte: new Date() },
      expiryDate: { $gte: new Date() },
    });

    if (!coupon) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Invalid or expired coupon code",
        errorType: "INVALID_COUPON"
      });
    }

    if (!coupon.canUserUseCoupon(userId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "You have reached the usage limit for this coupon.",
        errorType: "USAGE_LIMIT_REACHED",
        details: {
          usageLimit: coupon.usageLimit,
          couponCode: coupon.code
        }
      });
    }

    if (numericCartTotal < coupon.minPrice) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `Minimum cart value for this coupon is ₹${coupon.minPrice}`,
        errorType: "MINIMUM_CART_VALUE_NOT_MET",
        details: {
          minPrice: coupon.minPrice,
          currentTotal: numericCartTotal,
          difference: coupon.minPrice - numericCartTotal
        }
      });
    }

    if (coupon.type === "fixed" && coupon.discountValue > coupon.minPrice) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `Invalid coupon: Discount amount (₹${coupon.discountValue}) cannot be greater than minimum purchase amount (₹${coupon.minPrice})`,
        errorType: "INVALID_COUPON_CONFIGURATION"
      });
    }

    if (coupon.totalUsedCount >= coupon.totalUsageLimit) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "This coupon has reached its maximum usage limit",
        errorType: "TOTAL_USAGE_LIMIT_REACHED"
      });
    }

    let discount = 0;
    if (coupon.type === "percentage") {
      discount = (numericCartTotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      discount = coupon.discountValue;

      if (discount > numericCartTotal) {
        discount = numericCartTotal;
      }
    }

    const finalAmount = numericCartTotal - discount;




    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Coupon applied successfully",
      discount,
      finalAmount,
      coupon: {
        id: coupon._id,
        code: coupon.code,
        type: coupon.type,
        discountValue: coupon.discountValue,
        maxDiscount: coupon.maxDiscount,
      },
    });
  } catch (error) {
    console.error("Error applying coupon:", error);

    // Provide more specific error messages based on error type
    let errorMessage = "An unexpected error occurred while applying the coupon";

    if (error.name === 'ValidationError') {
      errorMessage = "Invalid coupon data. Please try again.";
    } else if (error.name === 'CastError') {
      errorMessage = "Invalid coupon format. Please check the coupon code.";
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage = "Request timed out. Please try again.";
    } else if (error.message && error.message.includes('network')) {
      errorMessage = "Network error. Please check your connection and try again.";
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: errorMessage,
      errorType: "INTERNAL_ERROR"
    });
  }
};


//=================================================================================================
// Remove Applied Coupon
//=================================================================================================
// This function removes an applied coupon.
// It removes an applied coupon.
//=================================================================================================
const removeAppliedCoupon = async (req, res) => {
  try {


    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Coupon removed successfully",
    });
  } catch (error) {
    console.error("Error removing coupon:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};


//=================================================================================================
// Get User Available Coupons
//=================================================================================================
// This function gets the user available coupons.
// It gets the user available coupons.
//=================================================================================================
const getUserAvailableCoupons = async (req, res) => {
  try {
    // Get user ID from session - handle both direct ID and object structure
    const userId = req.session.user?._id || req.session.user;

    console.log("Fetching coupons for user:", userId);

    if (!userId) {
      console.log("No user ID found in session");
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const now = new Date();
    console.log("Current date:", now);

    // Fetch available coupons with better error handling
    let availableCoupons;
    try {
      availableCoupons = await Coupon.find({
        isActive: true,
        isDelete: false,
        startDate: { $lte: now },
        expiryDate: { $gte: now }
      });
      console.log(`Found ${availableCoupons.length} active coupons`);
    } catch (dbError) {
      console.error("Database error while fetching coupons:", dbError);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Database error occurred while fetching coupons",
        error: "Unable to retrieve coupon data"
      });
    }

    // If no coupons found, return success with empty array
    if (!availableCoupons || availableCoupons.length === 0) {
      console.log("No active coupons found");
      return res.status(StatusCodes.OK).json({
        success: true,
        coupons: [],
        message: "No active coupons available at the moment"
      });
    }

    // Process coupons with better error handling
    const userCoupons = [];

    for (const coupon of availableCoupons) {
      try {
        // Validate coupon data
        if (!coupon.code || !coupon.type || coupon.discountValue === undefined) {
          console.warn(`Skipping invalid coupon: ${coupon._id}`);
          continue;
        }

        const userUsage = coupon.users ? coupon.users.find(u => u.userId.toString() === userId.toString()) : null;
        const usedCount = userUsage ? userUsage.usedCount : 0;
        const remainingUses = Math.max(0, (coupon.usageLimit || 1) - usedCount);
        const totalUsageLimit = coupon.totalUsageLimit || 1000;
        const totalUsedCount = coupon.totalUsedCount || 0;
        const isUsable = remainingUses > 0 && totalUsedCount < totalUsageLimit;

        if (isUsable) {
          userCoupons.push({
            _id: coupon._id,
            code: coupon.code,
            type: coupon.type,
            discountValue: coupon.discountValue,
            minPrice: coupon.minPrice || 0,
            maxPrice: coupon.maxPrice,
            expiryDate: coupon.expiryDate,
            usageLimit: coupon.usageLimit || 1,
            remainingUses: remainingUses,
            isUsable: true
          });
        }
      } catch (processingError) {
        console.error(`Error processing coupon ${coupon._id}:`, processingError);
        // Continue processing other coupons
        continue;
      }
    }

    console.log(`Processed ${userCoupons.length} usable coupons for user`);

    return res.status(StatusCodes.OK).json({
      success: true,
      coupons: userCoupons,
      message: userCoupons.length > 0 ? `Found ${userCoupons.length} available coupons` : "No coupons available for your account"
    });

  } catch (error) {
    console.error("Unexpected error in getUserAvailableCoupons:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An unexpected error occurred while fetching coupons",
      error: "Please try again later or contact support if the problem persists"
    });
  }
};

//=================================================================================================
// Module Exports
//=================================================================================================
// This exports the coupon controller functions.
// It exports the coupon controller functions to be used in the user routes.
//=================================================================================================
module.exports = {
  renderCouponsPage,
  getCouponByCode,
  applyCoupon,
  removeAppliedCoupon,
  getUserAvailableCoupons,
};
