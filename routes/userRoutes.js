import express from "express";
import userLoggedIn from "../middlewares/userLoggedIn.js";
import {
    profileGet,
    profileEditGet,
    profilePost,
    leaderboardGet
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

// Rotas de perfil de utilizador
router.get("/profile", userLoggedIn, profileGet);
router.get("/editar-perfil", userLoggedIn, profileEditGet);

// Rota para atualizar o perfil
router.post(
    "/editar-perfil",
    userLoggedIn,
    upload.single("imagemPerfil"),
    profilePost
);


router.get('/leaderboard', leaderboardGet);
export default router;
