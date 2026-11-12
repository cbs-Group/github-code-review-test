import { describe, expect, it } from "vitest";
import { UserStore, isValidEmail, toPublicUser, type User } from "./users";

const ada: User = { id: "u1", email: "Ada@Example.com", name: "Ada", passwordHash: "hash-ada" };

describe("isValidEmail", () => {
  it.each([
    ["ada@example.com", true],
    ["first.last@sub.example.org", true],
    ["no-at-sign.example.com", false],
    ["ada@localhost", false],
    ["ada @example.com", false],
    [`${"a".repeat(250)}@example.com`, false],
  ])("isValidEmail(%j) returns %s", (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });
});

describe("UserStore", () => {
  it("finds users by email case-insensitively", () => {
    const store = new UserStore();
    store.add(ada);
    expect(store.findByEmail("ada@example.com")).toBe(ada);
  });

  it("returns undefined for an unknown email", () => {
    expect(new UserStore().findByEmail("nobody@example.com")).toBeUndefined();
  });

  it("rejects users with an invalid email", () => {
    expect(() => new UserStore().add({ ...ada, email: "invalid" })).toThrow(TypeError);
  });
});

describe("toPublicUser", () => {
  it("removes the password hash", () => {
    expect(toPublicUser(ada)).toEqual({ id: "u1", email: "Ada@Example.com", name: "Ada" });
  });
});
