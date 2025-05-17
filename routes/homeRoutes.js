// routes/homeRoutes.js
import express from "express";
const router = express.Router();
import {
    getIndex
} from "../controllers/homeController.js";



router.get("/", getIndex);

export default router;