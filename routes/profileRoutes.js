const express = require('express');
const { uploadProfileImage } = require("../helpers/multer")
const router = express.Router();
const { userAuth, checkDemoRestrictions } = require('../middlewares/auth');
const {
  getProfile,
  updateProfile,
  manageAddresses,
  viewProfile
} = require('../controllers/user/profileController');

// Profile view route (accessible at /userProfile)
router.get('/', userAuth, viewProfile);

// Profile API routes (accessible at /userProfile/profile)
router.get('/profile', userAuth, getProfile);
router.put('/update', userAuth, checkDemoRestrictions, updateProfile, uploadProfileImage);

// Address management routes
router.post('/addresses', userAuth, checkDemoRestrictions, (req, res) => {
  req.body.action = 'ADD';
  manageAddresses(req, res);
});

router.put('/addresses/:id', userAuth, checkDemoRestrictions, (req, res) => {
  req.body.addressId = req.params.id;
  req.body.action = req.query.setDefault ? 'SET_DEFAULT' : 'UPDATE';
  manageAddresses(req, res);
});

router.delete('/addresses/:id', userAuth, checkDemoRestrictions, (req, res) => {
  req.body.addressId = req.params.id;
  req.body.action = 'DELETE';
  manageAddresses(req, res);
});

module.exports = router;