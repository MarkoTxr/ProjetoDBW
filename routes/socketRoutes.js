import express from "express";
import { getSocketTutorial } from "../controllers/socketController.js";
import userLoggedIn from "../middlewares/userLoggedIn.js";

const router = express.Router();

router.get("/", userLoggedIn, getSocketTutorial);

export default router;
