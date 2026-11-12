export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
}

export type PublicUser = Omit<User, "passwordHash">;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export class UserStore {
  readonly #users = new Map<string, User>();

  add(user: User): void {
    if (!isValidEmail(user.email)) {
      throw new TypeError("user.email is not a valid email address");
    }
    this.#users.set(user.email.toLowerCase(), user);
  }

  findByEmail(email: string): User | undefined {
    if (!isValidEmail(email)) {
      throw new TypeError("email is not a valid email address");
    }
    return this.#users.get(email.toLowerCase());
  }
}

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _omitted, ...publicFields } = user;
  return publicFields;
}
