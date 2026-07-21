import { verifyPassword, createSession, type User } from "./_utils";

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

    if (!username || !password) {
      return new Response(JSON.stringify({ error: "Missing username or password" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get user
    const user = await env.DB.prepare(
      "SELECT id, username, password_hash, password_salt FROM users WHERE username = ?"
    )
      .bind(username)
      .first<User>();

    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid username or password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid username or password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create session
    const token = await createSession(env.DB, user.id);

    return new Response(JSON.stringify({ 
      success: true, 
      token, 
      user: { id: user.id, username: user.username } 
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
