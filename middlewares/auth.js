const User = require("../models/userSchema");


const userAuth =(req,res,next)=>{
  if(req.session.user){
    User.findById(req.session.user)
    .then(data=>{
      if(data && !data.isBlocked){
        next();
      }else{
        res.redirect("/login")
      }
    })
    .catch(error=>{
      console.log("Error in user auth middlware");
      res.status(500).send("Internal Server Error")
    })
  }else{
    res.redirect("/login")
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