// index.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
// Make sure the file exists at the specified path, or update the path if necessary
// Make sure the file exists at the specified path, or update the path if necessary
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

app.get("/", (_, res) => res.send("INEE Backend Running"));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
