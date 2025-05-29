const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const offerService = require('../../services/newOfferService');

//=================================================================================================
// Render Offers Page
//=================================================================================================
// This function renders the offers page.
// It renders the offers page.
//=================================================================================================
exports.renderOffersPage = async (req, res) => {
  try {
    // Get pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 2; // Default to 2 offers per page
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalOffers = await Offer.countDocuments();

    // Get paginated offers
    const offers = await Offer.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Calculate total pages
    const totalPages = Math.ceil(totalOffers / limit) || 1; // Ensure at least 1 page even if no items

    // Build search params for pagination links
    const searchParams = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';
    const searchParamsWithoutLimit = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';

    res.render('admin-offers', {
      title: 'All Offers',
      activePage: 'offers',
      offers,
      success: req.flash('success'),
      error: req.flash('error'),
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalOffers,
        limit: limit,
        searchParams: searchParams + (limit !== 2 ? `&limit=${limit}` : ''),
        searchParamsWithoutLimit: searchParamsWithoutLimit
      }
    });
  } catch (error) {
    console.error('Error rendering offers page:', error);
    req.flash('error', 'Failed to load offers');
    res.redirect('/admin/dashboard');
  }
};

//=================================================================================================
// Render Product Offers Page
//=================================================================================================
// This function renders the product offers page.
// It renders the product offers page.
//=================================================================================================
exports.renderProductOffersPage = async (req, res) => {
  try {
    // Get pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 2; // Default to 2 offers per page
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalOffers = await Offer.countDocuments({ type: 'product' });

    // Get paginated offers
    const offers = await Offer.find({ type: 'product' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Calculate total pages
    const totalPages = Math.ceil(totalOffers / limit) || 1; // Ensure at least 1 page even if no items

    // Build search params for pagination links
    const searchParams = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';
    const searchParamsWithoutLimit = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';

    res.render('admin-product-offers', {
      title: 'Product Offers',
      activePage: 'product-offers',
      offers,
      success: req.flash('success'),
      error: req.flash('error'),
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalOffers,
        limit: limit,
        searchParams: searchParams + (limit !== 2 ? `&limit=${limit}` : ''),
        searchParamsWithoutLimit: searchParamsWithoutLimit
      }
    });
  } catch (error) {
    console.error('Error rendering product offers page:', error);
    req.flash('error', 'Failed to load product offers');
    res.redirect('/admin/dashboard');
  }
};

//=================================================================================================
// Render Category Offers Page
//=================================================================================================
// This function renders the category offers page.
// It renders the category offers page.
//=================================================================================================
exports.renderCategoryOffersPage = async (req, res) => {
  try {
    // Get pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 2; // Default to 2 offers per page
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalOffers = await Offer.countDocuments({ type: 'category' });

    // Get paginated offers
    const offers = await Offer.find({ type: 'category' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Calculate total pages
    const totalPages = Math.ceil(totalOffers / limit) || 1; // Ensure at least 1 page even if no items

    // Build search params for pagination links
    const searchParams = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';
    const searchParamsWithoutLimit = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';

    res.render('admin-category-offers', {
      title: 'Category Offers',
      activePage: 'category-offers',
      offers,
      success: req.flash('success'),
      error: req.flash('error'),
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalOffers,
        limit: limit,
        searchParams: searchParams + (limit !== 2 ? `&limit=${limit}` : ''),
        searchParamsWithoutLimit: searchParamsWithoutLimit
      }
    });
  } catch (error) {
    console.error('Error rendering category offers page:', error);
    req.flash('error', 'Failed to load category offers');
    res.redirect('/admin/dashboard');
  }
};

//=================================================================================================
// Render Create Product Offer Page
//=================================================================================================
// This function renders the create product offer page.
// It renders the create product offer page.
//=================================================================================================
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

//=================================================================================================
// Render Create Category Offer Page
//=================================================================================================
// This function renders the create category offer page.
// It renders the create category offer page.
//=================================================================================================
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

//=================================================================================================
// Render Edit Product Offer Page
//=================================================================================================
// This function renders the edit product offer page.
// It renders the edit product offer page.
//=================================================================================================
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

//=================================================================================================
// Render Edit Category Offer Page
//=================================================================================================
// This function renders the edit category offer page.
// It renders the edit category offer page.
//=================================================================================================
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

//=================================================================================================
// Create Product Offer
//=================================================================================================
// This function creates a new product offer.
// It creates a new product offer.
//=================================================================================================
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

    // Validate name (alphanumeric with spaces, min 3 chars, max 50 chars)
    if (!/^[a-zA-Z0-9\s]{3,50}$/.test(name)) {
      req.flash('error', 'Offer name must be 3-50 characters and contain only letters, numbers, and spaces');
      return res.redirect('/admin/product-offers/create');
    }

    // Validate description (min 10 chars, max 200 chars)
    if (description.length < 10 || description.length > 200) {
      req.flash('error', 'Description must be between 10 and 200 characters');
      return res.redirect('/admin/product-offers/create');
    }

    // Validate discount type
    if (discountType !== 'percentage' && discountType !== 'fixed') {
      req.flash('error', 'Invalid discount type. Must be percentage or fixed');
      return res.redirect('/admin/product-offers/create');
    }

    // Validate discount value
    const discountValueNum = parseFloat(discountValue);
    if (isNaN(discountValueNum) || discountValueNum <= 0) {
      req.flash('error', 'Discount value must be a positive number');
      return res.redirect('/admin/product-offers/create');
    }

    // Validate percentage discount (max 100%)
    if (discountType === 'percentage' && discountValueNum > 100) {
      req.flash('error', 'Percentage discount cannot exceed 100%');
      return res.redirect('/admin/product-offers/create');
    }

    // Validate max discount amount (if provided)
    if (maxDiscountAmount) {
      const maxDiscountAmountNum = parseFloat(maxDiscountAmount);
      if (isNaN(maxDiscountAmountNum) || maxDiscountAmountNum <= 0) {
        req.flash('error', 'Maximum discount amount must be a positive number');
        return res.redirect('/admin/product-offers/create');
      }
    }

    // Validate minimum purchase amount (if provided)
    const minPurchaseAmountNum = minPurchaseAmount ? parseFloat(minPurchaseAmount) : 0;
    if (isNaN(minPurchaseAmountNum) || minPurchaseAmountNum < 0) {
      req.flash('error', 'Minimum purchase amount must be a non-negative number');
      return res.redirect('/admin/product-offers/create');
    }

    // For fixed discount type, ensure minimum purchase amount is greater than the discount value
    if (discountType === 'fixed' && minPurchaseAmountNum <= discountValueNum) {
      req.flash('error', 'For fixed discount, minimum purchase amount must be greater than the discount value');
      return res.redirect('/admin/product-offers/create');
    }

    // Validate dates
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);
    const now = new Date();

    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      req.flash('error', 'Invalid date format');
      return res.redirect('/admin/product-offers/create');
    }

    // Removed validation that prevents past start dates

    if (parsedEndDate <= parsedStartDate) {
      req.flash('error', 'End date must be after start date');
      return res.redirect('/admin/product-offers/create');
    }

    // Validate offer duration (max 90 days)
    const durationInDays = (parsedEndDate - parsedStartDate) / (1000 * 60 * 60 * 24);
    if (durationInDays > 90) {
      req.flash('error', 'Offer duration cannot exceed 90 days');
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

//=================================================================================================
// Create Category Offer
//=================================================================================================
// This function creates a new category offer.
// It creates a new category offer.
//=================================================================================================
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

    // Validate name (alphanumeric with spaces, min 3 chars, max 50 chars)
    if (!/^[a-zA-Z0-9\s]{3,50}$/.test(name)) {
      req.flash('error', 'Offer name must be 3-50 characters and contain only letters, numbers, and spaces');
      return res.redirect('/admin/category-offers/create');
    }

    // Validate description (min 10 chars, max 200 chars)
    if (description.length < 10 || description.length > 200) {
      req.flash('error', 'Description must be between 10 and 200 characters');
      return res.redirect('/admin/category-offers/create');
    }

    // Validate discount type
    if (discountType !== 'percentage' && discountType !== 'fixed') {
      req.flash('error', 'Invalid discount type. Must be percentage or fixed');
      return res.redirect('/admin/category-offers/create');
    }

    // Validate discount value
    const discountValueNum = parseFloat(discountValue);
    if (isNaN(discountValueNum) || discountValueNum <= 0) {
      req.flash('error', 'Discount value must be a positive number');
      return res.redirect('/admin/category-offers/create');
    }

    // Validate percentage discount (max 100%)
    if (discountType === 'percentage' && discountValueNum > 100) {
      req.flash('error', 'Percentage discount cannot exceed 100%');
      return res.redirect('/admin/category-offers/create');
    }

    // Validate max discount amount (if provided)
    if (maxDiscountAmount) {
      const maxDiscountAmountNum = parseFloat(maxDiscountAmount);
      if (isNaN(maxDiscountAmountNum) || maxDiscountAmountNum <= 0) {
        req.flash('error', 'Maximum discount amount must be a positive number');
        return res.redirect('/admin/category-offers/create');
      }
    }

    // Validate minimum purchase amount (if provided)
    const minPurchaseAmountNum = minPurchaseAmount ? parseFloat(minPurchaseAmount) : 0;
    if (isNaN(minPurchaseAmountNum) || minPurchaseAmountNum < 0) {
      req.flash('error', 'Minimum purchase amount must be a non-negative number');
      return res.redirect('/admin/category-offers/create');
    }

    // For fixed discount type, ensure minimum purchase amount is greater than the discount value
    if (discountType === 'fixed' && minPurchaseAmountNum <= discountValueNum) {
      req.flash('error', 'For fixed discount, minimum purchase amount must be greater than the discount value');
      return res.redirect('/admin/category-offers/create');
    }

    // Validate dates
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);
    const now = new Date();

    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      req.flash('error', 'Invalid date format');
      return res.redirect('/admin/category-offers/create');
    }

    // Removed validation that prevents past start dates

    if (parsedEndDate <= parsedStartDate) {
      req.flash('error', 'End date must be after start date');
      return res.redirect('/admin/category-offers/create');
    }

    // Validate offer duration (max 90 days)
    const durationInDays = (parsedEndDate - parsedStartDate) / (1000 * 60 * 60 * 24);
    if (durationInDays > 90) {
      req.flash('error', 'Offer duration cannot exceed 90 days');
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

//=================================================================================================
// Update Product Offer
//=================================================================================================
// This function updates an existing product offer.
// It updates an existing product offer.
//=================================================================================================
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

    // Validate name (alphanumeric with spaces, min 3 chars, max 50 chars)
    if (!/^[a-zA-Z0-9\s]{3,50}$/.test(name)) {
      req.flash('error', 'Offer name must be 3-50 characters and contain only letters, numbers, and spaces');
      return res.redirect(`/admin/product-offers/edit/${id}`);
    }

    // Validate description (min 10 chars, max 200 chars)
    if (description.length < 10 || description.length > 200) {
      req.flash('error', 'Description must be between 10 and 200 characters');
      return res.redirect(`/admin/product-offers/edit/${id}`);
    }

    // Validate discount type
    if (discountType !== 'percentage' && discountType !== 'fixed') {
      req.flash('error', 'Invalid discount type. Must be percentage or fixed');
      return res.redirect(`/admin/product-offers/edit/${id}`);
    }

    // Validate discount value
    const discountValueNum = parseFloat(discountValue);
    if (isNaN(discountValueNum) || discountValueNum <= 0) {
      req.flash('error', 'Discount value must be a positive number');
      return res.redirect(`/admin/product-offers/edit/${id}`);
    }

    // Validate percentage discount (max 100%)
    if (discountType === 'percentage' && discountValueNum > 100) {
      req.flash('error', 'Percentage discount cannot exceed 100%');
      return res.redirect(`/admin/product-offers/edit/${id}`);
    }

    // Validate max discount amount (if provided)
    if (maxDiscountAmount) {
      const maxDiscountAmountNum = parseFloat(maxDiscountAmount);
      if (isNaN(maxDiscountAmountNum) || maxDiscountAmountNum <= 0) {
        req.flash('error', 'Maximum discount amount must be a positive number');
        return res.redirect(`/admin/product-offers/edit/${id}`);
      }
    }

    // Validate minimum purchase amount (if provided)
    const minPurchaseAmountNum = minPurchaseAmount ? parseFloat(minPurchaseAmount) : 0;
    if (isNaN(minPurchaseAmountNum) || minPurchaseAmountNum < 0) {
      req.flash('error', 'Minimum purchase amount must be a non-negative number');
      return res.redirect(`/admin/product-offers/edit/${id}`);
    }

    // For fixed discount type, ensure minimum purchase amount is greater than the discount value
    if (discountType === 'fixed' && minPurchaseAmountNum <= discountValueNum) {
      req.flash('error', 'For fixed discount, minimum purchase amount must be greater than the discount value');
      return res.redirect(`/admin/product-offers/edit/${id}`);
    }

    // Validate dates
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);
    const now = new Date();

    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      req.flash('error', 'Invalid date format');
      return res.redirect(`/admin/product-offers/edit/${id}`);
    }

    if (parsedEndDate <= parsedStartDate) {
      req.flash('error', 'End date must be after start date');
      return res.redirect(`/admin/product-offers/edit/${id}`);
    }

    // Validate offer duration (max 90 days)
    const durationInDays = (parsedEndDate - parsedStartDate) / (1000 * 60 * 60 * 24);
    if (durationInDays > 90) {
      req.flash('error', 'Offer duration cannot exceed 90 days');
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

//=================================================================================================
// Update Category Offer
//=================================================================================================
// This function updates an existing category offer.
// It updates an existing category offer.
//=================================================================================================
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

    // Validate name (alphanumeric with spaces, min 3 chars, max 50 chars)
    if (!/^[a-zA-Z0-9\s]{3,50}$/.test(name)) {
      req.flash('error', 'Offer name must be 3-50 characters and contain only letters, numbers, and spaces');
      return res.redirect(`/admin/category-offers/edit/${id}`);
    }

    // Validate description (min 10 chars, max 200 chars)
    if (description.length < 10 || description.length > 200) {
      req.flash('error', 'Description must be between 10 and 200 characters');
      return res.redirect(`/admin/category-offers/edit/${id}`);
    }

    // Validate discount type
    if (discountType !== 'percentage' && discountType !== 'fixed') {
      req.flash('error', 'Invalid discount type. Must be percentage or fixed');
      return res.redirect(`/admin/category-offers/edit/${id}`);
    }

    // Validate discount value
    const discountValueNum = parseFloat(discountValue);
    if (isNaN(discountValueNum) || discountValueNum <= 0) {
      req.flash('error', 'Discount value must be a positive number');
      return res.redirect(`/admin/category-offers/edit/${id}`);
    }

    // Validate percentage discount (max 100%)
    if (discountType === 'percentage' && discountValueNum > 100) {
      req.flash('error', 'Percentage discount cannot exceed 100%');
      return res.redirect(`/admin/category-offers/edit/${id}`);
    }

    // Validate max discount amount (if provided)
    if (maxDiscountAmount) {
      const maxDiscountAmountNum = parseFloat(maxDiscountAmount);
      if (isNaN(maxDiscountAmountNum) || maxDiscountAmountNum <= 0) {
        req.flash('error', 'Maximum discount amount must be a positive number');
        return res.redirect(`/admin/category-offers/edit/${id}`);
      }
    }

    // Validate minimum purchase amount (if provided)
    const minPurchaseAmountNum = minPurchaseAmount ? parseFloat(minPurchaseAmount) : 0;
    if (isNaN(minPurchaseAmountNum) || minPurchaseAmountNum < 0) {
      req.flash('error', 'Minimum purchase amount must be a non-negative number');
      return res.redirect(`/admin/category-offers/edit/${id}`);
    }

    // For fixed discount type, ensure minimum purchase amount is greater than the discount value
    if (discountType === 'fixed' && minPurchaseAmountNum <= discountValueNum) {
      req.flash('error', 'For fixed discount, minimum purchase amount must be greater than the discount value');
      return res.redirect(`/admin/category-offers/edit/${id}`);
    }

    // Validate dates
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);
    const now = new Date();

    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      req.flash('error', 'Invalid date format');
      return res.redirect(`/admin/category-offers/edit/${id}`);
    }

    if (parsedEndDate <= parsedStartDate) {
      req.flash('error', 'End date must be after start date');
      return res.redirect(`/admin/category-offers/edit/${id}`);
    }

    // Validate offer duration (max 90 days)
    const durationInDays = (parsedEndDate - parsedStartDate) / (1000 * 60 * 60 * 24);
    if (durationInDays > 90) {
      req.flash('error', 'Offer duration cannot exceed 90 days');
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

//=================================================================================================
// Delete Offer
//=================================================================================================
// This function deletes an offer.
// It deletes an offer.
//=================================================================================================
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
