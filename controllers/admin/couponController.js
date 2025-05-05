const cron = require("node-cron");
const Coupon = require("../../models/couponSchema.js");
const StatusCodes = require("../../utils/httpStatusCodes");
const mongoose = require("mongoose");

// ========================================================================================
// RENDER COUPONS PAGE
// ========================================================================================
const renderCouponsPage = async (req, res) => {
  const { page = 1, type = "all", isActive = "all" } = req.query;
  const limit = 10;

  try {
    const totalCouponsQuery = {};
    if (type !== "all") totalCouponsQuery.type = type;
    if (isActive !== "all") totalCouponsQuery.isActive = isActive === "true";

    const totalCoupons = await Coupon.countDocuments(totalCouponsQuery);

    const coupons = await Coupon.find(totalCouponsQuery)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalPages = Math.ceil(totalCoupons / limit);
    const discountTypes = await Coupon.distinct("type");

    return res.render("admin-coupon", {
      coupons,
      discountTypes,
      currentPage: parseInt(page, 10),
      totalPages,
      selectedType: type,
      selectedStatus: isActive,
      admin: req.session.admin,
    });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).render("admin/error", {
      message: "Error rendering coupons page.",
    });
  }
};

// ========================================================================================
// ADD COUPON
// ========================================================================================
const addCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      value,
      limit,
      minPrice,
      maxPrice,
      startDate,
      expiryDate,
    } = req.body;

    if (new Date(startDate) >= new Date(expiryDate)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Expiry date must be after start date",
      });
    }

    const newCoupon = new Coupon({
      code,
      type: discountType,
      discountValue: value,
      expiryDate: new Date(expiryDate),
      startDate: new Date(startDate),
      minPrice,
      maxPrice: discountType === "percentage" ? maxPrice : undefined,
      usageLimit: limit,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await newCoupon.save();

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Coupon added successfully!",
      coupon: newCoupon,
    });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: "Coupon code already exists",
      });
    }
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error saving the coupon",
      error: error.message,
    });
  }
};

// ========================================================================================
// DELETE COUPON (SOFT DELETE)
// ========================================================================================
const removeCoupon = async (req, res) => {
  try {
    const { id } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid coupon ID",
      });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Coupon not found",
      });
    }

    coupon.isDelete = true;
    coupon.updated_at = new Date();
    await coupon.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Coupon deleted successfully.",
      couponId: id,
    });
  } catch (error) {
    console.error("Error in deleting coupon", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ========================================================================================
// RESTORE COUPON
// ========================================================================================
const restoreCoupon = async (req, res) => {
  try {
    const { id } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid coupon ID",
      });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Coupon not found",
      });
    }

    coupon.isDelete = false;
    coupon.updated_at = new Date();
    await coupon.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Coupon restored successfully.",
      couponId: id,
    });
  } catch (error) {
    console.error("Error in restoring coupon", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ========================================================================================
// EDIT COUPON
// ========================================================================================
const editCoupon = async (req, res) => {
  try {
    const {
      id,
      code,
      discountType,
      value,
      limit,
      minPrice,
      maxPrice,
      startDate,
      expiryDate,
    } = req.body;

    // Validate coupon ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid coupon ID",
      });
    }

    // Validate date logic
    if (new Date(startDate) >= new Date(expiryDate)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Expiry date must be after start date",
      });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon || coupon.isDelete) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Coupon not found or deleted",
      });
    }

    // Update fields
    coupon.code = code;
    coupon.type = discountType;
    coupon.discountValue = value;
    coupon.usageLimit = limit;
    coupon.minPrice = minPrice;
    coupon.maxPrice = discountType === "percentage" ? maxPrice : undefined;
    coupon.startDate = new Date(startDate);
    coupon.expiryDate = new Date(expiryDate);
    coupon.updated_at = new Date();

    // Reset isActive if new startDate is in the future
    const now = new Date();
    if (new Date(startDate) > now) {
      coupon.isActive = false;
    }

    await coupon.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Coupon updated successfully",
      coupon,
    });
  } catch (error) {
    console.error("Error editing coupon:", error);

    // If duplicate code
    if (error.code === 11000) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: "Coupon code already exists",
      });
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ========================================================================================
// CRON JOB: Activate / Deactivate Coupons
// ========================================================================================
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    const couponsToActivate = await Coupon.find({
      startDate: { $lte: now },
      isActive: false,
      isDelete: false,
    });

    const activationUpdates = couponsToActivate.map((coupon) => {
      coupon.isActive = true;
      coupon.updated_at = now;
      return coupon.save();
    });

    await Promise.all(activationUpdates);

    const expiredCoupons = await Coupon.find({
      expiryDate: { $lt: now },
      isActive: true,
      isDelete: false,
    });

    const deactivationUpdates = expiredCoupons.map((coupon) => {
      coupon.isActive = false;
      coupon.updated_at = now;
      return coupon.save();
    });

    await Promise.all(deactivationUpdates);

    console.log(
      `Cron job: Activated ${activationUpdates.length} coupons, Deactivated ${deactivationUpdates.length} coupons`
    );
  } catch (error) {
    console.error("Error running cron job for coupon status update:", error);
  }
});

module.exports = {
  renderCouponsPage,
  addCoupon,
  removeCoupon,
  restoreCoupon,
  editCoupon,
};
