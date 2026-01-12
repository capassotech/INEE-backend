import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { cacheHeaders } from "./middleware/cacheHeaders";

dotenv.config();

// Routes
import authRoutes from "./modules/auth/routes";
import coursesRoutes from "./modules/courses/routes";
import purchasesRoutes from "./modules/purchases/routes";
import usersRoutes from "./modules/users/routes";
import contactRoutes from "./modules/contact/routes";
import newsletterRoutes from "./modules/newsletter/routes";
// MEMBRESÍAS DESACTIVADAS - Comentado para posible reactivación futura
// import membershipRoutes from "./modules/membership/routes";
import testimonialsRoutes from "./modules/testimonials/routes";
import eventsRoutes from "./modules/events/routes";
import profesorsRoutes from "./modules/profesors/routes";
import backModulesRoutes from "./modules/back-modules/routes";
import testVocacionalRoutes from "./modules/test-vocacional/routes";
import ebooksRoutes from "./modules/ebooks/routes";
import reviewsRoutes from "./modules/reviews/routes";
import cartRoutes from "./modules/cart/routes";
import paymentsRoutes from "./modules/payments/routes";
import progressRoutes from "./modules/progress/routes";
import ordersRoutes from "./modules/orders/routes";
import emailsRoutes from "./modules/emails/routes";
import eventRegistrationsRoutes from "./modules/event-registrations/routes";
import certificatesRoutes from "./modules/certificates/routes";


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api", cacheHeaders(300));

app.use("/api/auth", authRoutes);
app.use("/api/formaciones", coursesRoutes);
app.use("/api/purchases", purchasesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/newsletter", newsletterRoutes);
// MEMBRESÍAS DESACTIVADAS - Comentado para posible reactivación futura
// app.use("/api/membership", membershipRoutes);
app.use("/api/testimonios", testimonialsRoutes);
app.use("/api/eventos", eventsRoutes);
app.use("/api/profesores", profesorsRoutes);
app.use("/api/modulos", backModulesRoutes);
app.use("/api/test-vocacional", testVocacionalRoutes);
app.use("/api/ebooks", ebooksRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/progreso", progressRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/emails", emailsRoutes);
app.use("/api/inscripciones-eventos", eventRegistrationsRoutes);
app.use("/api/certificados", certificatesRoutes);

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