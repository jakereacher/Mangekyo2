const express = require("express");
const router = express.Router();
const { uploadsArray, uploadsFields } = require("../helpers/multer");

const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const orderController = require("../controllers/admin/orderController");
const couponController = require("../controllers/admin/couponController");
const offerController = require("../controllers/admin/offerController");
const reportController = require("../controllers/admin/reportController");

const { userAuth, adminAuth } = require("../middlewares/auth");


router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/dashboard", adminAuth, adminController.loadDashboard);
router.get("/logout", adminController.logout);

router.get("/users", adminAuth, customerController.customerInfo);
router.get("/blockCustomer", adminAuth, customerController.customerBlocked);
router.get("/unblockCustomer", adminAuth, customerController.customerunBlocked);

router.get("/category", adminAuth, categoryController.categoryInfo);
router.post("/addCategory", adminAuth, categoryController.addCategory);
router.get("/listCategory", adminAuth, categoryController.getListCategory);
router.get("/unlistCategory", adminAuth, categoryController.getUnlistCategory);
router.get("/editCategory", adminAuth, categoryController.getEditCategory);
router.post("/editCategory/:id", adminAuth, categoryController.editCategory);
router.post("/delete-category/:id", adminAuth, categoryController.deleteCategory);

router.get("/add-products", adminAuth, productController.getProductAddPage);
router.post("/add-products", adminAuth, uploadsArray, productController.addProducts);
router.get("/products", adminAuth, productController.getProductList);
router.post("/delete-product/:id", adminAuth, productController.deleteProduct);
router.post("/toggle-block-product/:id", adminAuth, productController.toggleBlockProduct);

// Order management routes
router.get("/orders", adminAuth, orderController.getAllOrders);
router.get("/orders/:orderId", adminAuth, orderController.getAdminOrderDetails);
router.post("/orders/:orderId/update-status", adminAuth, orderController.updateOrderItemStatus);

// Return management routes with pagination
router.get("/return-requests", adminAuth, orderController.getReturnRequests);
router.post("/orders/:orderId/approve-return", adminAuth, orderController.approveReturn);
router.post("/orders/:orderId/reject-return", adminAuth, orderController.rejectReturn);



router.get("/edit-product/:id", adminAuth, productController.getEditProductPage);
router.post(
  "/edit-product/:id",
  adminAuth,
  uploadsFields,
  productController.editProduct
);


// Coupon management routes
router.get("/coupons", couponController.renderCouponsPage);  // Ensure renderCouponsPage is defined in the controller
router.post("/add-coupon", couponController.addCoupon);
router.post("/remove-coupon", couponController.removeCoupon);
router.post("/restore-coupon", couponController.restoreCoupon);
router.put("/edit-coupon",couponController.editCoupon);

// General Offer management routes
router.get("/offers", adminAuth, offerController.renderOffersPage);
router.delete("/offers/delete/:id", adminAuth, offerController.deleteOffer);

// Product Offer routes
router.get("/product-offers", adminAuth, offerController.renderProductOffersPage);
router.get("/product-offers/create", adminAuth, offerController.renderCreateProductOfferPage);
router.post("/product-offers/create", adminAuth, offerController.createProductOffer);
router.get("/product-offers/edit/:id", adminAuth, offerController.renderEditProductOfferPage);
router.post("/product-offers/update/:id", adminAuth, offerController.updateProductOffer);

// Category Offer routes
router.get("/category-offers", adminAuth, offerController.renderCategoryOffersPage);
router.get("/category-offers/create", adminAuth, offerController.renderCreateCategoryOfferPage);
router.post("/category-offers/create", adminAuth, offerController.createCategoryOffer);
router.get("/category-offers/edit/:id", adminAuth, offerController.renderEditCategoryOfferPage);
router.post("/category-offers/update/:id", adminAuth, offerController.updateCategoryOffer);

// Sales Report routes
router.get("/sales-report", adminAuth, reportController.renderSalesReport);
router.get("/sales-report/download", adminAuth, reportController.downloadSalesReport);
router.get("/sales-report/download-pdf", adminAuth, reportController.downloadSalesReportPDF);

module.exports = router;