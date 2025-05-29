/**
 * CouponController
 */
const cron = require("node-cron");
const Coupon = require("../../models/couponSchema.js");
const StatusCodes = require("../../utils/httpStatusCodes");
const mongoose = require("mongoose");


//=================================================================================================
// Render Coupons Page
//=================================================================================================
// This function renders the coupons page, which displays all coupons and allows for filtering and pagination.
// It also handles the search functionality to filter coupons by type and status.
//=================================================================================================
const renderCouponsPage = async (req, res) => {
  const { page = 1, type = "all", isActive = "all", limit = 3 } = req.query;
  const pageSize = parseInt(limit, 10);
  const currentPage = parseInt(page, 10);

  try {
    const totalCouponsQuery = {};
    if (type !== "all") totalCouponsQuery.type = type;
    if (isActive !== "all") totalCouponsQuery.isActive = isActive === "true";

    const query = { ...totalCouponsQuery, isDelete: false };
    const totalCoupons = await Coupon.countDocuments(query);

    const coupons = await Coupon.find(query)
      .sort({ created_at: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize);

    const totalPages = Math.ceil(totalCoupons / pageSize);
    const discountTypes = await Coupon.distinct("type");

    const searchParams = `&type=${type}&isActive=${isActive}`;
    const searchParamsWithoutLimit = `&type=${type}&isActive=${isActive}`;

    return res.render("admin/admin-coupon", {
      activePage: 'coupons',
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



//=================================================================================================
// Add Coupon
//=================================================================================================
// This function adds a new coupon to the database.
// It validates the coupon data and creates a new coupon object.
//=================================================================================================
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

    if (!code || code.trim() === '') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    if (!/^[a-zA-Z0-9]+$/.test(code)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Coupon code must contain only letters and numbers",
      });
    }

    if (!discountType || (discountType !== 'percentage' && discountType !== 'fixed')) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid discount type. Must be 'percentage' or 'fixed'",
      });
    }

    const discountValue = parseFloat(value);
    if (isNaN(discountValue) || discountValue <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Discount value must be a positive number",
      });
    }

    if (discountType === 'percentage' && discountValue > 100) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
      });
    }

    const minPriceValue = parseFloat(minPrice);
    if (isNaN(minPriceValue) || minPriceValue < 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Minimum price must be a non-negative number",
      });
    }

    if (discountType === 'fixed' && discountValue > minPriceValue) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "For fixed discount coupons, discount value cannot be greater than minimum purchase amount.",
      });
    }

    let maxPriceValue = null;
    if (maxPrice) {
      maxPriceValue = parseFloat(maxPrice);
      if (isNaN(maxPriceValue) || maxPriceValue <= 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Maximum price must be a positive number",
        });
      }

      if (maxPriceValue <= minPriceValue) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Maximum price must be greater than minimum price",
        });
      }
    }

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

    const parsedStartDate = new Date(startDate);
    const parsedExpiryDate = new Date(expiryDate);

    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedExpiryDate.getTime())) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid date format",
      });
    }

    if (parsedStartDate >= parsedExpiryDate) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Expiry date must be after start date",
      });
    }

    const now = new Date();
    const isActive = parsedStartDate <= now && parsedExpiryDate > now;

    const newCoupon = new Coupon({
      code,
      type: discountType,
      discountValue: value,
      expiryDate: parsedExpiryDate,
      startDate: parsedStartDate,
      minPrice,
      maxPrice: discountType === "percentage" ? maxPrice : undefined,
      usageLimit: limit,
      isActive: isActive, // Set to true if start date is in the past or present and not expired
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
    console.error("Error adding coupon:", error);

    if (error.code === 11000) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: "Coupon code already exists"
      });
    }
    else if (error.name === 'ValidationError') {

      const errorMessage = Object.values(error.errors)
        .map(err => err.message)
        .join('. ');

      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: errorMessage,
        validationErrors: error.errors
      });
    }
    else {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || "Error saving the coupon"
      });
    }
  }
};



//=================================================================================================
// Remove Coupon
//=================================================================================================
// This function removes a coupon from the database.
// It updates the coupon's isDelete field to true.
//=================================================================================================
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



//=================================================================================================
// Restore Coupon
//=================================================================================================
// This function restores a coupon from the database.
// It updates the coupon's isDelete field to false.
//=================================================================================================
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



//=================================================================================================
// Edit Coupon
//=================================================================================================
// This function edits a coupon in the database.
// It updates the coupon's code, type, discount value, limit, min price, max price, start date, and expiry date.
//================================================================================================= 
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

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid coupon ID",
      });
    }

    if (!code || code.trim() === '') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    if (!/^[a-zA-Z0-9]+$/.test(code)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Coupon code must contain only letters and numbers",
      });
    }

    if (!discountType || (discountType !== 'percentage' && discountType !== 'fixed')) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid discount type. Must be 'percentage' or 'fixed'",
      });
    }

    const discountValue = parseFloat(value);
    if (isNaN(discountValue) || discountValue <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Discount value must be a positive number",
      });
    }

    if (discountType === 'percentage' && discountValue > 100) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
      });
    }

    const minPriceValue = parseFloat(minPrice);
    if (isNaN(minPriceValue) || minPriceValue < 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Minimum price must be a non-negative number",
      });
    }

    if (discountType === 'fixed' && discountValue > minPriceValue) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "For fixed discount coupons, discount value cannot be greater than minimum purchase amount.",
      });
    }

    let maxPriceValue = null;
    if (maxPrice) {
      maxPriceValue = parseFloat(maxPrice);
      if (isNaN(maxPriceValue) || maxPriceValue <= 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Maximum price must be a positive number",
        });
      }

      if (maxPriceValue <= minPriceValue) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Maximum price must be greater than minimum price",
        });
      }
    }

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

    const parsedStartDate = new Date(startDate);
    const parsedExpiryDate = new Date(expiryDate);

    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedExpiryDate.getTime())) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid date format",
      });
    }

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

    coupon.code = code;
    coupon.type = discountType;
    coupon.discountValue = value;
    coupon.usageLimit = limit;
    coupon.minPrice = minPrice;
    coupon.maxPrice = discountType === "percentage" ? maxPrice : undefined;
    coupon.startDate = parsedStartDate;
    coupon.expiryDate = parsedExpiryDate;
    coupon.updated_at = new Date();

    const now = new Date();
    if (parsedStartDate <= now && parsedExpiryDate > now) {

      coupon.isActive = true;
    } else if (parsedStartDate > now) {

      coupon.isActive = false;
    } else if (parsedExpiryDate <= now) {

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

    if (error.code === 11000) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: "Coupon code already exists"
      });
    }
    else if (error.name === 'ValidationError') {

      const errorMessage = Object.values(error.errors)
        .map(err => err.message)
        .join('. ');

      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: errorMessage,
        validationErrors: error.errors
      });
    }
    else {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || "Error updating the coupon"
      });
    }
  }
};



//=================================================================================================
// Cron Job for Coupon Status Update
//=================================================================================================
// This cron job updates the status of coupons based on their start and expiry dates.
// It activates coupons that have started and are not active, and deactivates coupons that have expired.
//=================================================================================================
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
