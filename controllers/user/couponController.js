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
    if (isNaN(numericCartTotal)) {
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
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
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
    const userId = req.session.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const now = new Date();
    const availableCoupons = await Coupon.find({
      isActive: true,
      isDelete: false,
      startDate: { $lte: now },
      expiryDate: { $gte: now }
    });

    const userCoupons = availableCoupons.map(coupon => {
      const userUsage = coupon.users.find(u => u.userId.toString() === userId.toString());
      const usedCount = userUsage ? userUsage.usedCount : 0;
      const remainingUses = coupon.usageLimit - usedCount;

      return {
        _id: coupon._id,
        code: coupon.code,
        type: coupon.type,
        discountValue: coupon.discountValue,
        minPrice: coupon.minPrice,
        maxPrice: coupon.maxPrice,
        expiryDate: coupon.expiryDate,
        usageLimit: coupon.usageLimit,
        remainingUses: remainingUses > 0 ? remainingUses : 0,
        isUsable: remainingUses > 0 && coupon.totalUsedCount < coupon.totalUsageLimit
      };
    }).filter(coupon => coupon.isUsable);

    return res.status(StatusCodes.OK).json({
      success: true,
      coupons: userCoupons
    });
  } catch (error) {
    console.error("Error fetching user available coupons:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch available coupons",
      error: error.message
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
