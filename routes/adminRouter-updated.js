const express = require("express");
const router = express.Router();
const multer = require("multer");

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

// Import controllers
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController-updated");
const productController = require("../controllers/admin/productController-updated");
const orderController = require("../controllers/admin/orderController");
const couponController = require("../controllers/admin/couponController");
const offerController = require("../controllers/admin/offerController");
const reportController = require("../controllers/admin/reportController");

// Import middleware
const { adminAuth } = require("../middlewares/auth");

// Admin authentication routes
router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/dashboard", adminAuth, adminController.loadDashboard);
router.get("/logout", adminController.logout);

// Customer management routes
router.get("/users", adminAuth, customerController.customerInfo);
router.get("/blockCustomer", adminAuth, customerController.customerBlocked);
router.get("/unblockCustomer", adminAuth, customerController.customerunBlocked);

// Category management routes
router.get("/category", adminAuth, categoryController.categoryInfo);
router.post("/addCategory", adminAuth, upload.single('image'), categoryController.addCategory);
router.get("/category/:id", adminAuth, categoryController.getCategoryById);
router.get("/listCategory", adminAuth, categoryController.getListCategory);
router.get("/unlistCategory", adminAuth, categoryController.getUnlistCategory);
router.post("/editCategory/:id", adminAuth, upload.single('image'), categoryController.editCategory);
router.post("/editCategory", adminAuth, upload.single('image'), categoryController.editCategory);
router.post("/delete-category/:id", adminAuth, categoryController.deleteCategory);

// Product management routes
router.get("/add-products", adminAuth, productController.getProductAddPage);
router.post("/add-products", adminAuth, upload.array('images', 5), productController.addProducts);
router.get("/products", adminAuth, productController.getProductList);
router.get("/edit-product/:id", adminAuth, productController.getEditProductPage);
router.post("/edit-product/:id", adminAuth, upload.array('images', 5), productController.editProduct);
router.post("/delete-product/:id", adminAuth, productController.deleteProduct);
router.post("/toggle-block-product/:id", adminAuth, productController.toggleBlockProduct);

// Order management routes
router.get("/orders", adminAuth, orderController.getAllOrders);
router.get("/orders/:orderId", adminAuth, orderController.getAdminOrderDetails);
router.post("/orders/:orderId/update-status", adminAuth, orderController.updateOrderItemStatus);

// Return management routes
router.get("/return-requests", adminAuth, orderController.getReturnRequests);
router.post("/orders/:orderId/approve-return", adminAuth, orderController.approveReturn);
router.post("/orders/:orderId/reject-return", adminAuth, orderController.rejectReturn);

// Coupon management routes
router.get("/coupons", adminAuth, couponController.renderCouponsPage);
router.post("/add-coupon", adminAuth, couponController.addCoupon);
router.post("/remove-coupon", adminAuth, couponController.removeCoupon);
router.post("/restore-coupon", adminAuth, couponController.restoreCoupon);
router.put("/edit-coupon", adminAuth, couponController.editCoupon);

// Offer management routes
router.get("/offers", adminAuth, offerController.renderOffersPage);
router.delete("/offers/delete/:id", adminAuth, offerController.deleteOffer);

// Category Offer routes
router.get("/category-offers", adminAuth, offerController.renderCategoryOffersPage);
router.get("/category-offers/create", adminAuth, offerController.renderCreateCategoryOfferPage);
router.post("/category-offers/create", adminAuth, offerController.createCategoryOffer);
router.get("/category-offers/edit/:id", adminAuth, offerController.renderEditCategoryOfferPage);
router.post("/category-offers/update/:id", adminAuth, offerController.updateCategoryOffer);

// Product Offer routes
router.get("/product-offers", adminAuth, offerController.renderProductOffersPage);
router.get("/product-offers/create", adminAuth, offerController.renderCreateProductOfferPage);
router.post("/product-offers/create", adminAuth, offerController.createProductOffer);
router.get("/product-offers/edit/:id", adminAuth, offerController.renderEditProductOfferPage);
router.post("/product-offers/update/:id", adminAuth, offerController.updateProductOffer);

// Sales Report routes
router.get("/sales-report", adminAuth, reportController.renderSalesReport);
router.get("/sales-report/download", adminAuth, reportController.downloadSalesReport);

module.exports = router;
