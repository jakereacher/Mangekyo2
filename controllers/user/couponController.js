const Coupon = require("../../models/couponSchema.js");
const StatusCodes = require("../../utils/httpStatusCodes");

// ========================================================================================
// RENDER COUPONS PAGE
// ========================================================================================
const renderCouponsPage = async (req, res) => {
  try {
    // Fetch active coupons (excluding deleted ones)
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

// ========================================================================================
// GET COUPON BY CODE (API ENDPOINT - KEPT AS JSON RESPONSE)
// ========================================================================================
const getCouponByCode = async (req, res) => {
  const { code } = req.params;

  try {
    // Fetch coupon by code if active and not deleted
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

// ========================================================================================
// APPLY COUPON (API ENDPOINT - KEPT AS JSON RESPONSE)
// ========================================================================================
const applyCoupon = async (req, res) => {
  try {
    const { code, cartTotal, userId } = req.body;
    console.log(req.body); // For debugging purposes

    if (!code || !cartTotal || !userId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Coupon code, cart total, and user ID are required.",
        missingFields: {
          code: !code,
          cartTotal: !cartTotal,
          userId: !userId,
        },
      });
    }

    const numericCartTotal = Number(cartTotal);
    if (isNaN(numericCartTotal)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid cart total value",
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
      });
    }

    // Check if the user can use the coupon
    if (!coupon.canUserUseCoupon(userId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "You have reached the usage limit for this coupon.",
      });
    }

    if (numericCartTotal < coupon.minPrice) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `Minimum cart value for this coupon is ₹${coupon.minPrice}`,
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
    }

    const finalAmount = numericCartTotal - discount;

    // We'll only validate the coupon here, but not increment usage
    // Usage will be incremented only when the order is actually placed
    // This prevents double-counting when a user applies a coupon and then places an order

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

// ========================================================================================
// REMOVE APPLIED COUPON
// ========================================================================================
const removeAppliedCoupon = async (req, res) => {
  try {
    // No database operation needed, just return success
    // The frontend will handle removing the coupon from the UI and checkout data
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

module.exports = {
  renderCouponsPage,
  getCouponByCode,
  applyCoupon,
  removeAppliedCoupon,
};