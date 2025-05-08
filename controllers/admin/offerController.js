const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const offerService = require('../../services/offerService');

/**
 * Render offers list page
 */
exports.renderOffersPage = async (req, res) => {
  try {
    const offers = await Offer.find()
      .sort({ createdAt: -1 })
      .lean();

    res.render('admin-offers', {
      title: 'Manage Offers',
      offers,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (error) {
    console.error('Error rendering offers page:', error);
    req.flash('error', 'Failed to load offers');
    res.redirect('/admin/dashboard');
  }
};

/**
 * Render create offer page
 */
exports.renderCreateOfferPage = async (req, res) => {
  try {
    const products = await Product.find({ isBlocked: false })
      .sort({ productName: 1 })
      .lean();

    const categories = await Category.find({ isListed: true })
      .sort({ name: 1 })
      .lean();

    res.render('admin-offer-create', {
      title: 'Create Offer',
      products,
      categories,
      error: req.flash('error')
    });
  } catch (error) {
    console.error('Error rendering create offer page:', error);
    req.flash('error', 'Failed to load create offer page');
    res.redirect('/admin/offers');
  }
};

/**
 * Render edit offer page
 */
exports.renderEditOfferPage = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id).lean();
    if (!offer) {
      req.flash('error', 'Offer not found');
      return res.redirect('/admin/offers');
    }

    const products = await Product.find({ isBlocked: false })
      .sort({ productName: 1 })
      .lean();

    const categories = await Category.find({ isListed: true })
      .sort({ name: 1 })
      .lean();

    // Format dates for the form
    offer.startDateFormatted = offer.startDate.toISOString().split('T')[0];
    offer.endDateFormatted = offer.endDate.toISOString().split('T')[0];

    res.render('admin-offer-edit', {
      title: 'Edit Offer',
      offer,
      products,
      categories,
      error: req.flash('error')
    });
  } catch (error) {
    console.error('Error rendering edit offer page:', error);
    req.flash('error', 'Failed to load edit offer page');
    res.redirect('/admin/offers');
  }
};

/**
 * Create a new offer
 */
exports.createOffer = async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      discountType,
      discountValue,
      maxDiscountAmount,
      minPurchaseAmount,
      startDate,
      endDate,
      applicableProducts,
      applicableCategories
    } = req.body;

    // Validate required fields
    if (!name || !description || !type || !discountType || !discountValue || !startDate || !endDate) {
      req.flash('error', 'Please fill all required fields');
      return res.redirect('/admin/offers/create');
    }

    // Create offer
    const offerData = {
      name,
      description,
      type,
      discountType,
      discountValue: parseFloat(discountValue),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: true
    };

    // Add optional fields if provided
    if (maxDiscountAmount) {
      offerData.maxDiscountAmount = parseFloat(maxDiscountAmount);
    }

    if (minPurchaseAmount) {
      offerData.minPurchaseAmount = parseFloat(minPurchaseAmount);
    }

    // Add applicable products/categories based on offer type
    if (type === 'product' && applicableProducts) {
      offerData.applicableProducts = Array.isArray(applicableProducts)
        ? applicableProducts
        : [applicableProducts];
    }

    if (type === 'category' && applicableCategories) {
      offerData.applicableCategories = Array.isArray(applicableCategories)
        ? applicableCategories
        : [applicableCategories];
    }

    const offer = new Offer(offerData);
    await offer.save();

    // Apply offer to products or categories
    if (type === 'product' && offerData.applicableProducts) {
      for (const productId of offerData.applicableProducts) {
        await offerService.applyProductOffer(productId, offer._id);
      }
    }

    if (type === 'category' && offerData.applicableCategories) {
      for (const categoryId of offerData.applicableCategories) {
        await offerService.applyCategoryOffer(categoryId, offer._id);
      }
    }

    req.flash('success', 'Offer created successfully');
    res.redirect('/admin/offers');
  } catch (error) {
    console.error('Error creating offer:', error);
    req.flash('error', 'Failed to create offer');
    res.redirect('/admin/offers/create');
  }
};

/**
 * Update an existing offer
 */
exports.updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      type,
      discountType,
      discountValue,
      maxDiscountAmount,
      minPurchaseAmount,
      startDate,
      endDate,
      applicableProducts,
      applicableCategories,
      isActive
    } = req.body;

    // Validate required fields
    if (!name || !description || !type || !discountType || !discountValue || !startDate || !endDate) {
      req.flash('error', 'Please fill all required fields');
      return res.redirect(`/admin/offers/edit/${id}`);
    }

    // Get existing offer
    const existingOffer = await Offer.findById(id);
    if (!existingOffer) {
      req.flash('error', 'Offer not found');
      return res.redirect('/admin/offers');
    }

    // Update offer data
    const offerData = {
      name,
      description,
      type,
      discountType,
      discountValue: parseFloat(discountValue),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: isActive === 'on' || isActive === true
    };

    // Add optional fields if provided
    if (maxDiscountAmount) {
      offerData.maxDiscountAmount = parseFloat(maxDiscountAmount);
    }

    if (minPurchaseAmount) {
      offerData.minPurchaseAmount = parseFloat(minPurchaseAmount);
    }

    // Handle applicable products/categories
    if (type === 'product') {
      // Convert to array if single value
      const productIds = Array.isArray(applicableProducts)
        ? applicableProducts
        : applicableProducts ? [applicableProducts] : [];

      // Remove offer from products that are no longer applicable
      const removedProducts = existingOffer.applicableProducts.filter(
        p => !productIds.includes(p.toString())
      );

      for (const productId of removedProducts) {
        await offerService.removeProductOffer(productId);
      }

      // Apply offer to new products
      for (const productId of productIds) {
        await offerService.applyProductOffer(productId, id);
      }

      offerData.applicableProducts = productIds;
      offerData.applicableCategories = [];
    }

    if (type === 'category') {
      // Convert to array if single value
      const categoryIds = Array.isArray(applicableCategories)
        ? applicableCategories
        : applicableCategories ? [applicableCategories] : [];

      // Remove offer from categories that are no longer applicable
      const removedCategories = existingOffer.applicableCategories.filter(
        c => !categoryIds.includes(c.toString())
      );

      for (const categoryId of removedCategories) {
        await offerService.removeCategoryOffer(categoryId);
      }

      // Apply offer to new categories
      for (const categoryId of categoryIds) {
        await offerService.applyCategoryOffer(categoryId, id);
      }

      offerData.applicableCategories = categoryIds;
      offerData.applicableProducts = [];
    }

    // Update offer
    await Offer.findByIdAndUpdate(id, offerData);

    req.flash('success', 'Offer updated successfully');
    res.redirect('/admin/offers');
  } catch (error) {
    console.error('Error updating offer:', error);
    req.flash('error', 'Failed to update offer');
    res.redirect(`/admin/offers/edit/${req.params.id}`);
  }
};

/**
 * Delete an offer
 */
exports.deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    // Remove offer from products
    if (offer.type === 'product' && offer.applicableProducts.length > 0) {
      for (const productId of offer.applicableProducts) {
        await offerService.removeProductOffer(productId);
      }
    }

    // Remove offer from categories
    if (offer.type === 'category' && offer.applicableCategories.length > 0) {
      for (const categoryId of offer.applicableCategories) {
        await offerService.removeCategoryOffer(categoryId);
      }
    }

    // Delete the offer
    await Offer.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Offer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting offer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete offer'
    });
  }
};
