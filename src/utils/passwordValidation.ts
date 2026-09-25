export const PASSWORD_MIN_LENGTH = 6;

export const PASSWORD_SPECIAL_CHAR_REGEX =
  /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export type PasswordRequirementsState = {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
};

export const getPasswordRequirements = (
  password: string
): PasswordRequirementsState => ({
  minLength: password.length >= PASSWORD_MIN_LENGTH,
  hasUppercase: /[A-Z]/.test(password),
  hasLowercase: /[a-z]/.test(password),
  hasNumber: /[0-9]/.test(password),
  hasSpecialChar: PASSWORD_SPECIAL_CHAR_REGEX.test(password),
});

export const arePasswordRequirementsMet = (
  requirements: PasswordRequirementsState
): boolean =>
  requirements.minLength &&
  requirements.hasUppercase &&
  requirements.hasLowercase &&
  requirements.hasNumber &&
  requirements.hasSpecialChar;

export const isPasswordValid = (password: string): boolean =>
  arePasswordRequirementsMet(getPasswordRequirements(password));

export const getPasswordValidationErrors = (password: string): string[] => {
  const errors: string[] = [];
  const requirements = getPasswordRequirements(password);

  if (!requirements.minLength) {
    errors.push(
      `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`
    );
  }
  if (!requirements.hasLowercase) {
    errors.push("La contraseña debe contener al menos una letra minúscula");
  }
  if (!requirements.hasUppercase) {
    errors.push("La contraseña debe contener al menos una letra mayúscula");
  }
  if (!requirements.hasNumber) {
    errors.push("La contraseña debe contener al menos un número");
  }
  if (!requirements.hasSpecialChar) {
    errors.push("La contraseña debe contener al menos un carácter especial");
  }

  return errors;
};
