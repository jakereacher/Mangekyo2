const Wishlist = require('../../models/wishlist.model');
const Product = require('../../models/productSchema');

// GET Wishlist
exports.getWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;

    const wishlist = await Wishlist.findOne({ userId }).populate('products.productId');

    if (!wishlist) {
      return res.json({ products: [] });
    }

    const filteredProducts = wishlist.products.filter(p => p.productId !== null);

    res.json({ products: filteredProducts });
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

// ADD to Wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const productId = req.body.productId;

    let wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      wishlist = new Wishlist({ userId, products: [] });
    }

    const alreadyExists = wishlist.products.some(
      (item) => item.productId.toString() === productId
    );

    if (alreadyExists) {
      return res.status(400).json({ message: 'Product already in wishlist' });
    }

    wishlist.products.push({ productId });
    await wishlist.save();

    res.status(200).json({ message: 'Added to wishlist' });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

// REMOVE from Wishlist
exports.removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const productId = req.params.productId;

    const wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    wishlist.products = wishlist.products.filter(
      (item) => item.productId.toString() !== productId
    );

    await wishlist.save();

    res.status(200).json({ message: 'Removed from wishlist' });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

// REMOVE from Wishlist when added to cart
exports.removeFromWishlistIfExists = async (userId, productId) => {
  try {
    const wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) return;

    const exists = wishlist.products.some(
      (item) => item.productId.toString() === productId.toString()
    );

    if (exists) {
      wishlist.products = wishlist.products.filter(
        (item) => item.productId.toString() !== productId.toString()
      );
      await wishlist.save();
    }
  } catch (error) {
    console.error('Error auto-removing from wishlist:', error);
  }
};
