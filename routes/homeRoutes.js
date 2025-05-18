// routes/homeRoutes.js
import express from "express";
const router = express.Router();
import {
    listarSessoes
} from "../controllers/sessaoController.js";



router.get("/", listarSessoes);

export default router;