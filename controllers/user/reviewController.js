const Review = require('../../models/reviewSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');

//=================================================================================================
// Add Review
//=================================================================================================
const addReview = async (req, res) => {
  try {
    const { productId, rating, title, content } = req.body;
    const userId = req.session.user;

    // Validate input
    if (!productId || !rating || !title || !content) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user has already reviewed this product
    const existingReview = await Review.findOne({ user: userId, product: productId });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product'
      });
    }

    // Check if user has purchased this product
    const hasPurchased = await Order.findOne({
      userId: userId,
      'orderedItems.product': productId,
      'orderedItems.status': 'Delivered'
    });

    // Create new review
    const newReview = new Review({
      user: userId,
      product: productId,
      rating: parseInt(rating),
      title: title.trim(),
      content: content.trim(),
      isVerifiedPurchase: !!hasPurchased
    });

    await newReview.save();

    // Update product's average rating and review count
    await updateProductRating(productId);

    res.status(201).json({
      success: true,
      message: 'Review added successfully'
    });

  } catch (error) {
    console.error('Error adding review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add review'
    });
  }
};

//=================================================================================================
// Get Product Reviews
//=================================================================================================
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const reviews = await Review.find({
      product: productId,
      isBlocked: false
    })
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const totalReviews = await Review.countDocuments({
      product: productId,
      isBlocked: false
    });

    const totalPages = Math.ceil(totalReviews / limit);

    res.json({
      success: true,
      reviews,
      pagination: {
        currentPage: page,
        totalPages,
        totalReviews,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

//=================================================================================================
// Update Product Rating
//=================================================================================================
const updateProductRating = async (productId) => {
  try {
    const reviews = await Review.find({ product: productId, isBlocked: false });

    if (reviews.length === 0) {
      await Product.findByIdAndUpdate(productId, {
        averageRating: 0,
        reviewCount: 0
      });
      return;
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / reviews.length;

    await Product.findByIdAndUpdate(productId, {
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      reviewCount: reviews.length
    });

  } catch (error) {
    console.error('Error updating product rating:', error);
  }
};

//=================================================================================================
// Get Review Statistics
//=================================================================================================
const getReviewStats = async (req, res) => {
  try {
    const { productId } = req.params;

    const reviews = await Review.find({ product: productId, isBlocked: false });

    const stats = {
      totalReviews: reviews.length,
      averageRating: 0,
      ratingDistribution: {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0
      }
    };

    if (reviews.length > 0) {
      const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
      stats.averageRating = Math.round((totalRating / reviews.length) * 10) / 10;

      reviews.forEach(review => {
        stats.ratingDistribution[review.rating]++;
      });
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching review stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch review statistics'
    });
  }
};

//=================================================================================================
// Check if User Can Review
//=================================================================================================
const canUserReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.session.user;

    if (!userId) {
      return res.json({
        success: true,
        canReview: false,
        reason: 'Please login to write a review'
      });
    }

    // Check if user has already reviewed
    const existingReview = await Review.findOne({ user: userId, product: productId });
    if (existingReview) {
      return res.json({
        success: true,
        canReview: false,
        reason: 'You have already reviewed this product'
      });
    }

    // Check if user has purchased this product
    const hasPurchased = await Order.findOne({
      userId: userId,
      'orderedItems.product': productId,
      'orderedItems.status': 'Delivered'
    });

    res.json({
      success: true,
      canReview: true,
      isVerifiedPurchase: !!hasPurchased
    });

  } catch (error) {
    console.error('Error checking review eligibility:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check review eligibility'
    });
  }
};

//=================================================================================================
// Update All Product Ratings (Utility function)
//=================================================================================================
const updateAllProductRatings = async () => {
  try {
    const products = await Product.find({});

    for (const product of products) {
      await updateProductRating(product._id);
    }

    console.log('Updated ratings for all products');
  } catch (error) {
    console.error('Error updating all product ratings:', error);
  }
};

//=================================================================================================
// Delete Review
//=================================================================================================
const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Find the review
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check if the user is the author of the review
    if (review.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own reviews'
      });
    }

    const productId = review.product;

    // Delete the review
    await Review.findByIdAndDelete(reviewId);

    // Update product's average rating and review count
    await updateProductRating(productId);

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review'
    });
  }
};

module.exports = {
  addReview,
  getProductReviews,
  getReviewStats,
  canUserReview,
  deleteReview,
  updateProductRating,
  updateAllProductRatings
};
