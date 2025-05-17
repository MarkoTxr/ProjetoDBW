import express from "express";
import {
    loginGet,
    registerGet,
    loginPostRedirect,
    registerPost,
    logout
} from "../controllers/authController.js";

const router = express.Router();

// Rotas de autenticação
router.get("/login", loginGet);
router.post("/login", loginPostRedirect);
router.get("/register", registerGet);
router.post("/register", registerPost);
router.get("/logout", logout);

export default router;
