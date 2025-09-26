import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

// Routes
import authRoutes from "./modules/auth/routes";
import coursesRoutes from "./modules/courses/routes";
import purchasesRoutes from "./modules/purchases/routes";
import usersRoutes from "./modules/users/routes";
import contactRoutes from "./modules/contact/routes";
import newsletterRoutes from "./modules/newsletter/routes";
import membershipRoutes from "./modules/membership/routes";
import testimonialsRoutes from "./modules/testimonials/routes";
import eventsRoutes from "./modules/events/routes";
import profesorsRoutes from "./modules/profesors/routes";
import backModulesRoutes from "./modules/back-modules/routes";
import testVocacionalRoutes from "./modules/test-vocacional/routes";
import courseImagesRoutes from "./modules/course-images/routes";


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/formaciones", coursesRoutes);
app.use("/api/formaciones/imagenes", courseImagesRoutes);
app.use("/api/purchases", purchasesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/membership", membershipRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/membership", membershipRoutes);
app.use("/api/testimonios", testimonialsRoutes);
app.use("/api/eventos", eventsRoutes);
app.use("/api/profesores", profesorsRoutes);
app.use("/api/modulos", backModulesRoutes);
app.use("/api/test-vocacional", testVocacionalRoutes);

app.get("/", (_, res) => {
  res.json({
    message: "INEE Backend Running",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
  });
});
app.get("/health", (_, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
