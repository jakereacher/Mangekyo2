const cron = require("node-cron");
const Coupon = require("../../models/couponSchema.js");
const StatusCodes = require("../../utils/httpStatusCodes");
const mongoose = require("mongoose");

// ========================================================================================
// RENDER COUPONS PAGE
// ========================================================================================
const renderCouponsPage = async (req, res) => {
  const { page = 1, type = "all", isActive = "all", limit = 3 } = req.query;
  const pageSize = parseInt(limit, 10);
  const currentPage = parseInt(page, 10);

  try {
    const totalCouponsQuery = {};
    if (type !== "all") totalCouponsQuery.type = type;
    if (isActive !== "all") totalCouponsQuery.isActive = isActive === "true";

    // Add isDelete filter to only show non-deleted coupons by default
    const query = { ...totalCouponsQuery, isDelete: false };
    const totalCoupons = await Coupon.countDocuments(query);

    const coupons = await Coupon.find(query)
      .sort({ created_at: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize);

    const totalPages = Math.ceil(totalCoupons / pageSize);
    const discountTypes = await Coupon.distinct("type");

    // Build search params for pagination links
    const searchParams = `&type=${type}&isActive=${isActive}`;
    const searchParamsWithoutLimit = `&type=${type}&isActive=${isActive}`;

    return res.render("admin-coupon", {
      coupons,
      discountTypes,
      pagination: {
        currentPage: currentPage,
        totalPages: totalPages,
        totalItems: totalCoupons,
        limit: pageSize,
        searchParams: searchParams,
        searchParamsWithoutLimit: searchParamsWithoutLimit
      },
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

    // Validate coupon code
    if (!code || code.trim() === '') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    // Validate coupon code format (alphanumeric only)
    if (!/^[a-zA-Z0-9]+$/.test(code)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Coupon code must contain only letters and numbers",
      });
    }

    // Validate discount type
    if (!discountType || (discountType !== 'percentage' && discountType !== 'fixed')) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid discount type. Must be 'percentage' or 'fixed'",
      });
    }

    // Validate discount value
    const discountValue = parseFloat(value);
    if (isNaN(discountValue) || discountValue <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Discount value must be a positive number",
      });
    }

    // Validate percentage discount (max 100%)
    if (discountType === 'percentage' && discountValue > 100) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
      });
    }

    // Validate minimum price
    const minPriceValue = parseFloat(minPrice);
    if (isNaN(minPriceValue) || minPriceValue < 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Minimum price must be a non-negative number",
      });
    }

    // Validate maximum price (if provided)
    let maxPriceValue = null;
    if (maxPrice) {
      maxPriceValue = parseFloat(maxPrice);
      if (isNaN(maxPriceValue) || maxPriceValue <= 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Maximum price must be a positive number",
        });
      }

      // Validate max price is greater than min price
      if (maxPriceValue <= minPriceValue) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Maximum price must be greater than minimum price",
        });
      }
    }

    // Validate usage limit (if provided)
    let usageLimit = null;
    if (limit) {
      usageLimit = parseInt(limit, 10);
      if (isNaN(usageLimit) || usageLimit <= 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Usage limit must be a positive integer",
        });
      }
    }

    // Parse dates with time
    const parsedStartDate = new Date(startDate);
    const parsedExpiryDate = new Date(expiryDate);

    // Validate dates are valid
    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedExpiryDate.getTime())) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid date format",
      });
    }

    // Validate expiry date is after start date
    if (parsedStartDate >= parsedExpiryDate) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Expiry date must be after start date",
      });
    }

    const newCoupon = new Coupon({
      code,
      type: discountType,
      discountValue: value,
      expiryDate: parsedExpiryDate,
      startDate: parsedStartDate,
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

    // Validate coupon code
    if (!code || code.trim() === '') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    // Validate coupon code format (alphanumeric only)
    if (!/^[a-zA-Z0-9]+$/.test(code)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Coupon code must contain only letters and numbers",
      });
    }

    // Validate discount type
    if (!discountType || (discountType !== 'percentage' && discountType !== 'fixed')) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid discount type. Must be 'percentage' or 'fixed'",
      });
    }

    // Validate discount value
    const discountValue = parseFloat(value);
    if (isNaN(discountValue) || discountValue <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Discount value must be a positive number",
      });
    }

    // Validate percentage discount (max 100%)
    if (discountType === 'percentage' && discountValue > 100) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
      });
    }

    // Validate minimum price
    const minPriceValue = parseFloat(minPrice);
    if (isNaN(minPriceValue) || minPriceValue < 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Minimum price must be a non-negative number",
      });
    }

    // Validate maximum price (if provided)
    let maxPriceValue = null;
    if (maxPrice) {
      maxPriceValue = parseFloat(maxPrice);
      if (isNaN(maxPriceValue) || maxPriceValue <= 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Maximum price must be a positive number",
        });
      }

      // Validate max price is greater than min price
      if (maxPriceValue <= minPriceValue) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Maximum price must be greater than minimum price",
        });
      }
    }

    // Validate usage limit (if provided)
    let usageLimit = null;
    if (limit) {
      usageLimit = parseInt(limit, 10);
      if (isNaN(usageLimit) || usageLimit <= 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Usage limit must be a positive integer",
        });
      }
    }

    // Parse dates with time
    const parsedStartDate = new Date(startDate);
    const parsedExpiryDate = new Date(expiryDate);

    // Validate dates are valid
    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedExpiryDate.getTime())) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid date format",
      });
    }

    // Validate expiry date is after start date
    if (parsedStartDate >= parsedExpiryDate) {
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
    coupon.startDate = parsedStartDate;
    coupon.expiryDate = parsedExpiryDate;
    coupon.updated_at = new Date();

    // Reset isActive if new startDate is in the future
    const now = new Date();
    if (parsedStartDate > now) {
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
