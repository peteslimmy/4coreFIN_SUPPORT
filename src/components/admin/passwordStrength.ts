export function isPasswordValid(password: string, minLength = 8): boolean {
  return (
    password.length >= minLength &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$%^&*(),.?":{}|<>]/.test(password)
  );
}
