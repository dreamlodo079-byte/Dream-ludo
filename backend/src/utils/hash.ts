import crypto from 'crypto';

/**
 * Hashes a user's password using SHA-256 with a static salt
 * to prevent dictionary attacks.
 */
export const hashPassword = (password: string): string => {
  return crypto
    .createHash('sha256')
    .update(password + '_dreamludo_production_salt_2026')
    .digest('hex');
};
