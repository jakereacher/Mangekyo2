const User = require("../models/userSchema");


const userAuth =(req,res,next)=>{
  // Check if this is an API request
  const isApiRequest = req.xhr ||
                      req.headers.accept?.includes('application/json') ||
                      req.headers['content-type']?.includes('application/json') ||
                      req.get('X-Requested-With') === 'XMLHttpRequest' ||
                      req.originalUrl.includes('/razorpay/') ||
                      req.originalUrl.includes('/wallet/') ||
                      req.originalUrl.includes('/checkout/') ||
                      req.originalUrl.includes('/cart/') ||
                      req.originalUrl.includes('/orders/');

  if(req.session.user){
    User.findById(req.session.user)
    .then(data=>{
      if(data && !data.isBlocked){
        next();
      }else{
        if (isApiRequest) {
          res.setHeader('Content-Type', 'application/json');
          return res.status(401).json({
            success: false,
            message: 'User account is blocked or not found',
            redirect: '/login'
          });
        } else {
          res.redirect("/login");
        }
      }
    })
    .catch(error=>{
      console.log("Error in user auth middlware");
      if (isApiRequest) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({
          success: false,
          message: 'Authentication error',
          redirect: '/login'
        });
      } else {
        res.status(500).send("Internal Server Error");
      }
    })
  }else{
    if (isApiRequest) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        redirect: '/login'
      });
    } else {
      res.redirect("/login");
    }
  }
}

const adminAuth = (req, res, next) => {
  if (req.session.admin) {
          next();
        } else {
          res.redirect("/admin/login");
        }

};

const checkDemoRestrictions = (req, res, next) => {
  if (req.session.isDemo) {
    if (req.method !== 'GET') {
      return res.status(403).json({
        error: "Demo accounts cannot perform this action"
      });
    }
  }
  next();
};



module.exports={
  userAuth,
  adminAuth,
  checkDemoRestrictions
}