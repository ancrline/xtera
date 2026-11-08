import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10
});

// Without a listener, an error on an idle client would crash the process.
pool.on("error", error => {
  console.error("Unexpected idle database client error:", error.message);
});

export async function testDbConnection() {
  const result = await pool.query("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
