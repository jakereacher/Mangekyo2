const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const offerService = require('../../services/offerService');

/**
 * Render all offers list page
 */
exports.renderOffersPage = async (req, res) => {
  try {
    const offers = await Offer.find()
      .sort({ createdAt: -1 })
      .lean();

    res.render('admin-offers', {
      title: 'All Offers',
      activePage: 'offers',
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
 * Render product offers list page
 */
exports.renderProductOffersPage = async (req, res) => {
  try {
    const offers = await Offer.find({ type: 'product' })
      .sort({ createdAt: -1 })
      .lean();

    res.render('admin-product-offers', {
      title: 'Product Offers',
      activePage: 'product-offers',
      offers,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (error) {
    console.error('Error rendering product offers page:', error);
    req.flash('error', 'Failed to load product offers');
    res.redirect('/admin/dashboard');
  }
};

/**
 * Render category offers list page
 */
exports.renderCategoryOffersPage = async (req, res) => {
  try {
    const offers = await Offer.find({ type: 'category' })
      .sort({ createdAt: -1 })
      .lean();

    res.render('admin-category-offers', {
      title: 'Category Offers',
      activePage: 'category-offers',
      offers,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (error) {
    console.error('Error rendering category offers page:', error);
    req.flash('error', 'Failed to load category offers');
    res.redirect('/admin/dashboard');
  }
};

/**
 * Render create product offer page
 */
exports.renderCreateProductOfferPage = async (req, res) => {
  try {
    const products = await Product.find({ isBlocked: false })
      .sort({ productName: 1 })
      .lean();

    res.render('admin-product-offer-create', {
      title: 'Create Product Offer',
      activePage: 'product-offers',
      products,
      error: req.flash('error')
    });
  } catch (error) {
    console.error('Error rendering create product offer page:', error);
    req.flash('error', 'Failed to load create product offer page');
    res.redirect('/admin/product-offers');
  }
};

/**
 * Render create category offer page
 */
exports.renderCreateCategoryOfferPage = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true })
      .sort({ name: 1 })
      .lean();

    res.render('admin-category-offer-create', {
      title: 'Create Category Offer',
      activePage: 'category-offers',
      categories,
      error: req.flash('error')
    });
  } catch (error) {
    console.error('Error rendering create category offer page:', error);
    req.flash('error', 'Failed to load create category offer page');
    res.redirect('/admin/category-offers');
  }
};

/**
 * Render edit product offer page
 */
exports.renderEditProductOfferPage = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id).lean();
    if (!offer) {
      req.flash('error', 'Offer not found');
      return res.redirect('/admin/product-offers');
    }

    if (offer.type !== 'product') {
      req.flash('error', 'Invalid offer type');
      return res.redirect('/admin/product-offers');
    }

    const products = await Product.find({ isBlocked: false })
      .sort({ productName: 1 })
      .lean();

    // Format dates for the form
    offer.startDateFormatted = offer.startDate.toISOString().split('T')[0];
    offer.endDateFormatted = offer.endDate.toISOString().split('T')[0];

    // Format dates with time for the flatpickr
    offer.startDateTimeFormatted = offer.startDate.toISOString().replace('Z', '').replace('T', ' ').substring(0, 16);
    offer.endDateTimeFormatted = offer.endDate.toISOString().replace('Z', '').replace('T', ' ').substring(0, 16);

    res.render('admin-product-offer-edit', {
      title: 'Edit Product Offer',
      activePage: 'product-offers',
      offer,
      products,
      error: req.flash('error')
    });
  } catch (error) {
    console.error('Error rendering edit product offer page:', error);
    req.flash('error', 'Failed to load edit product offer page');
    res.redirect('/admin/product-offers');
  }
};

/**
 * Render edit category offer page
 */
exports.renderEditCategoryOfferPage = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id).lean();
    if (!offer) {
      req.flash('error', 'Offer not found');
      return res.redirect('/admin/category-offers');
    }

    if (offer.type !== 'category') {
      req.flash('error', 'Invalid offer type');
      return res.redirect('/admin/category-offers');
    }

    const categories = await Category.find({ isListed: true })
      .sort({ name: 1 })
      .lean();

    // Format dates for the form
    offer.startDateFormatted = offer.startDate.toISOString().split('T')[0];
    offer.endDateFormatted = offer.endDate.toISOString().split('T')[0];

    // Format dates with time for the flatpickr
    offer.startDateTimeFormatted = offer.startDate.toISOString().replace('Z', '').replace('T', ' ').substring(0, 16);
    offer.endDateTimeFormatted = offer.endDate.toISOString().replace('Z', '').replace('T', ' ').substring(0, 16);

    res.render('admin-category-offer-edit', {
      title: 'Edit Category Offer',
      activePage: 'category-offers',
      offer,
      categories,
      error: req.flash('error')
    });
  } catch (error) {
    console.error('Error rendering edit category offer page:', error);
    req.flash('error', 'Failed to load edit category offer page');
    res.redirect('/admin/category-offers');
  }
};

/**
 * Create a new product offer
 */
exports.createProductOffer = async (req, res) => {
  try {
    const {
      name,
      description,
      discountType,
      discountValue,
      maxDiscountAmount,
      minPurchaseAmount,
      startDate,
      endDate,
      applicableProducts
    } = req.body;

    // Validate required fields
    if (!name || !description || !discountType || !discountValue || !startDate || !endDate) {
      req.flash('error', 'Please fill all required fields');
      return res.redirect('/admin/product-offers/create');
    }

    // Validate product selection
    if (!applicableProducts || (Array.isArray(applicableProducts) && applicableProducts.length === 0)) {
      req.flash('error', 'Please select at least one product');
      return res.redirect('/admin/product-offers/create');
    }

    // Create offer
    const offerData = {
      name,
      description,
      type: 'product', // Always product for this route
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

    // Add applicable products
    offerData.applicableProducts = Array.isArray(applicableProducts)
      ? applicableProducts
      : [applicableProducts];

    const offer = new Offer(offerData);
    await offer.save();

    // Apply offer to products
    for (const productId of offerData.applicableProducts) {
      await offerService.applyProductOffer(productId, offer._id);

      // Update product with offer details
      const product = await Product.findById(productId);
      if (product) {
        await product.updateOfferDetails();
      }
    }

    req.flash('success', 'Product offer created successfully');
    res.redirect('/admin/product-offers');
  } catch (error) {
    console.error('Error creating product offer:', error);
    req.flash('error', 'Failed to create product offer');
    res.redirect('/admin/product-offers/create');
  }
};

/**
 * Create a new category offer
 */
exports.createCategoryOffer = async (req, res) => {
  try {
    const {
      name,
      description,
      discountType,
      discountValue,
      maxDiscountAmount,
      minPurchaseAmount,
      startDate,
      endDate,
      applicableCategories
    } = req.body;

    // Validate required fields
    if (!name || !description || !discountType || !discountValue || !startDate || !endDate) {
      req.flash('error', 'Please fill all required fields');
      return res.redirect('/admin/category-offers/create');
    }

    // Validate category selection
    if (!applicableCategories || (Array.isArray(applicableCategories) && applicableCategories.length === 0)) {
      req.flash('error', 'Please select at least one category');
      return res.redirect('/admin/category-offers/create');
    }

    // Create offer
    const offerData = {
      name,
      description,
      type: 'category', // Always category for this route
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

    // Add applicable categories
    offerData.applicableCategories = Array.isArray(applicableCategories)
      ? applicableCategories
      : [applicableCategories];

    const offer = new Offer(offerData);
    await offer.save();

    // Apply offer to categories
    for (const categoryId of offerData.applicableCategories) {
      await offerService.applyCategoryOffer(categoryId, offer._id);

      // Update category with offer details
      const category = await Category.findById(categoryId);
      if (category) {
        await category.updateOfferDetails();
      }
    }

    req.flash('success', 'Category offer created successfully');
    res.redirect('/admin/category-offers');
  } catch (error) {
    console.error('Error creating category offer:', error);
    req.flash('error', 'Failed to create category offer');
    res.redirect('/admin/category-offers/create');
  }
};

/**
 * Update an existing product offer
 */
exports.updateProductOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      discountType,
      discountValue,
      maxDiscountAmount,
      minPurchaseAmount,
      startDate,
      endDate,
      applicableProducts,
      isActive
    } = req.body;

    // Validate required fields
    if (!name || !description || !discountType || !discountValue || !startDate || !endDate) {
      req.flash('error', 'Please fill all required fields');
      return res.redirect(`/admin/product-offers/edit/${id}`);
    }

    // Validate product selection
    if (!applicableProducts || (Array.isArray(applicableProducts) && applicableProducts.length === 0)) {
      req.flash('error', 'Please select at least one product');
      return res.redirect(`/admin/product-offers/edit/${id}`);
    }

    // Get existing offer
    const existingOffer = await Offer.findById(id);
    if (!existingOffer) {
      req.flash('error', 'Offer not found');
      return res.redirect('/admin/product-offers');
    }

    // Ensure it's a product offer
    if (existingOffer.type !== 'product') {
      req.flash('error', 'Invalid offer type');
      return res.redirect('/admin/product-offers');
    }

    // Update offer data
    const offerData = {
      name,
      description,
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

      // Update product with offer details
      const product = await Product.findById(productId);
      if (product) {
        await product.updateOfferDetails();
      }
    }

    offerData.applicableProducts = productIds;

    // Update offer
    await Offer.findByIdAndUpdate(id, offerData);

    req.flash('success', 'Product offer updated successfully');
    res.redirect('/admin/product-offers');
  } catch (error) {
    console.error('Error updating product offer:', error);
    req.flash('error', 'Failed to update product offer');
    res.redirect(`/admin/product-offers/edit/${req.params.id}`);
  }
};

/**
 * Update an existing category offer
 */
exports.updateCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      discountType,
      discountValue,
      maxDiscountAmount,
      minPurchaseAmount,
      startDate,
      endDate,
      applicableCategories,
      isActive
    } = req.body;

    // Validate required fields
    if (!name || !description || !discountType || !discountValue || !startDate || !endDate) {
      req.flash('error', 'Please fill all required fields');
      return res.redirect(`/admin/category-offers/edit/${id}`);
    }

    // Validate category selection
    if (!applicableCategories || (Array.isArray(applicableCategories) && applicableCategories.length === 0)) {
      req.flash('error', 'Please select at least one category');
      return res.redirect(`/admin/category-offers/edit/${id}`);
    }

    // Get existing offer
    const existingOffer = await Offer.findById(id);
    if (!existingOffer) {
      req.flash('error', 'Offer not found');
      return res.redirect('/admin/category-offers');
    }

    // Ensure it's a category offer
    if (existingOffer.type !== 'category') {
      req.flash('error', 'Invalid offer type');
      return res.redirect('/admin/category-offers');
    }

    // Update offer data
    const offerData = {
      name,
      description,
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

      // Update category with offer details
      const category = await Category.findById(categoryId);
      if (category) {
        await category.updateOfferDetails();
      }
    }

    offerData.applicableCategories = categoryIds;

    // Update offer
    await Offer.findByIdAndUpdate(id, offerData);

    req.flash('success', 'Category offer updated successfully');
    res.redirect('/admin/category-offers');
  } catch (error) {
    console.error('Error updating category offer:', error);
    req.flash('error', 'Failed to update category offer');
    res.redirect(`/admin/category-offers/edit/${req.params.id}`);
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

        // Update product to reflect offer removal
        const product = await Product.findById(productId);
        if (product) {
          await product.updateOfferDetails();
        }
      }
    }

    // Remove offer from categories
    if (offer.type === 'category' && offer.applicableCategories.length > 0) {
      for (const categoryId of offer.applicableCategories) {
        await offerService.removeCategoryOffer(categoryId);

        // Update category to reflect offer removal
        const category = await Category.findById(categoryId);
        if (category) {
          await category.updateOfferDetails();
        }
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
