import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./modules/auth/routes";
import coursesRoutes from "./modules/courses/routes";
import purchasesRoutes from "./modules/purchases/routes";
import usersRoutes from "./modules/users/routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/purchases", purchasesRoutes);
app.use("/api/users", usersRoutes);

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
