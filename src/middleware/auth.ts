import {Context, Next} from "hono";
import supabase from "../lib/supabase";

export type AuthUser = {
  id: string;
  email?: string;
  role?: string;
};

type AuthEnv = {
  Variables: {
    user: AuthUser;
  };
};

/**
 * Auth middleware that verifies the Supabase JWT token
 * Expects Authorization header: "Bearer <token>"
 */
export const authMiddleware = async (c: Context<AuthEnv>, next: Next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json({error: "Missing Authorization header"}, 401);
  }

  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return c.json({error: "Missing token"}, 401);
  }

  const {
    data: {user},
    error
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return c.json({error: "Invalid or expired token"}, 401);
  }

  // Attach user to context for use in route handlers
  c.set("user", {
    id: user.id,
    email: user.email,
    role: user.role
  });

  await next();
};
