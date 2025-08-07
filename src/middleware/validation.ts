import { Request, Response, NextFunction } from "express";
import {
  UserRegistrationData,
  LoginData,
  UpdateProfileData,
} from "../types/user";

export const validateRegistration = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const {
    email,
    password,
    nombre,
    apellido,
    dni,
    aceptaTerminos,
  }: UserRegistrationData = req.body;

  const errors: string[] = [];

  if (!email) errors.push("Email es requerido");
  if (!password) errors.push("Contraseña es requerida");
  if (!nombre) errors.push("Nombre es requerido");
  if (!apellido) errors.push("Apellido es requerido");
  if (!dni) errors.push("DNI es requerido");
  if (aceptaTerminos !== true)
    errors.push("Debe aceptar los términos y condiciones");

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Formato de email inválido");
  }

  if (password && password.length < 6) {
    errors.push("La contraseña debe tener al menos 6 caracteres");
  }

  if (nombre && (typeof nombre !== "string" || nombre.trim().length < 2)) {
    errors.push("El nombre debe tener al menos 2 caracteres");
  }

  if (
    apellido &&
    (typeof apellido !== "string" || apellido.trim().length < 2)
  ) {
    errors.push("El apellido debe tener al menos 2 caracteres");
  }

  if (dni && !/^\d{7,8}$/.test(dni)) {
    errors.push("DNI debe tener entre 7 y 8 dígitos");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: "Datos de registro inválidos",
      details: errors,
    });
  }

  // Sanitizar datos
  req.body.nombre = nombre.trim();
  req.body.apellido = apellido.trim();
  req.body.email = email.toLowerCase().trim();

  next();
};

export const validateLogin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { email, password }: LoginData = req.body;
  const errors: string[] = [];

  if (!email) errors.push("Email es requerido");
  if (!password) errors.push("Contraseña es requerida");

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Formato de email inválido");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: "Datos de login inválidos",
      details: errors,
    });
  }

  // Sanitizar email
  req.body.email = email.toLowerCase().trim();

  next();
};

export const validateProfileUpdate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { nombre, apellido }: UpdateProfileData = req.body;
  const errors: string[] = [];

  if (!nombre && !apellido) {
    errors.push("Debe proporcionar al menos un campo para actualizar");
  }

  if (nombre && (typeof nombre !== "string" || nombre.trim().length < 2)) {
    errors.push("El nombre debe tener al menos 2 caracteres");
  }

  if (
    apellido &&
    (typeof apellido !== "string" || apellido.trim().length < 2)
  ) {
    errors.push("El apellido debe tener al menos 2 caracteres");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: "Datos de actualización inválidos",
      details: errors,
    });
  }

  if (nombre) req.body.nombre = nombre.trim();
  if (apellido) req.body.apellido = apellido.trim();

  next();
};
