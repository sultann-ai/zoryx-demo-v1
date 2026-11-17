export const MIN_PASSWORD_LENGTH = 8;

// For staff passwords being created or reset. Deliberately NOT used on login — existing
// accounts with shorter passwords must still be able to sign in.
export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length === 0) {
    return "password is required";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}
