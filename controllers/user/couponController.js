const Coupon = require("../../models/couponSchema.js");
const StatusCodes = require("../../utils/httpStatusCodes");

// ========================================================================================
// GET ACTIVE COUPONS
// ========================================================================================
const getActiveCoupons = async (req, res) => {
  try {
    // Fetch active coupons (excluding deleted ones)
    const activeCoupons = await Coupon.find({
      isActive: true,
      isDelete: false,
    }).sort({ created_at: -1 });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Active coupons fetched successfully",
      coupons: activeCoupons,
    });
  } catch (error) {
    console.error("Error fetching active coupons:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ========================================================================================
// GET COUPON BY CODE (OPTIONAL)
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

module.exports = {
  getActiveCoupons,
  getCouponByCode,
};
