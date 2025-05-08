const express = require('express');
const router = express.Router();
const offerController = require('../../controllers/admin/offerController');
const { isAdmin } = require('../../middlewares/authMiddleware');

// Apply admin middleware to all routes
router.use(isAdmin);

// Offer routes
router.get('/', offerController.renderOffersPage);
router.get('/create', offerController.renderCreateOfferPage);
router.post('/create', offerController.createOffer);
router.get('/edit/:id', offerController.renderEditOfferPage);
router.post('/update/:id', offerController.updateOffer);
router.delete('/delete/:id', offerController.deleteOffer);

module.exports = router;
