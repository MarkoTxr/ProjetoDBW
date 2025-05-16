import express from "express";
import userLoggedIn from "../middlewares/userLoggedIn.js";
import {
    
    
    loginGet,
    registerGet,
    loginPostRedirect,
    registerPost,
    profileGet,
    logout
} from "../controllers/userController.js";


const router = express.Router();


router.get("/login", loginGet);
router.post(
    "/login",
    loginPostRedirect
);

router.get("/register", registerGet);


router.get("/profile", userLoggedIn, profileGet);

router.get("/logout",userLoggedIn, logout);

router.post(
    "/register",
    registerPost 
);
export default router;
