import { hashPassword } from "./_utils";

interface Env {
  DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { username, password } = await request.json() as any;

    if (!username || !password || username.length < 3 || password.length < 8) {
      return new Response(JSON.stringify({ error: "Invalid username or password (min 3/8 chars)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if user already exists
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?")
      .bind(username)
      .first();

    if (existing) {
      return new Response(JSON.stringify({ error: "Username already taken" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Hash password
    const { hash, salt } = await hashPassword(password);
    const userId = crypto.randomUUID();

    // Store user
    await env.DB.prepare(
      "INSERT INTO users (id, username, password_hash, password_salt) VALUES (?, ?, ?, ?)"
    )
      .bind(userId, username, hash, salt)
      .run();

    return new Response(JSON.stringify({ success: true, userId }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
