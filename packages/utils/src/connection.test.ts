import { newPgConnectionConfig } from "./connection";

describe("connection", () => {
  it("should parse single DATABASE_URL", () => {
    const url = "postgres://joist:local@db:5432/joist";
    const info = newPgConnectionConfig({ DATABASE_URL: url });
    expect(info).toEqual(url);
  });

  it("should parse multiple DB variables", () => {
    const info = newPgConnectionConfig({
      DB_USER: "joist",
      DB_PASSWORD: "local",
      DB_DATABASE: "joist",
      DB_HOST: "db",
      DB_PORT: "5432",
    });
    expect(info).toEqual({
      database: "joist",
      host: "db",
      password: "local",
      port: 5432,
      ssl: undefined,
      user: "joist",
    });
  });
});
