import express from "express";
import userLoggedIn from "../middlewares/userLoggedIn.js";
import {
    loginGet,
    registerGet,
    loginPostRedirect,
    registerPost,
    profileGet,
    profileEditGet,
    profilePost,
    logout
} from "../controllers/userController.js";
import multer from "multer";
import path from "path";

// Configuração do Multer para upload de imagens
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "public/images/pfp");
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("Apenas imagens são permitidas"));
    },
});

const router = express.Router();

router.get("/login", loginGet);
router.post(
    "/login",
    loginPostRedirect
);

router.get("/register", registerGet);

router.get("/profile", userLoggedIn, profileGet);
router.get(
    "/editar-perfil",
    userLoggedIn,
    profileEditGet
);

// Rota para atualizar o perfil
router.post(
    "/editar-perfil",
    userLoggedIn,
    upload.single("imagemPerfil"),
    profilePost
);

router.get("/logout", userLoggedIn, logout);
router.post(
    "/register",
    registerPost 
);

export default router;
