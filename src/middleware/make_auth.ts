import {MiddlewareHandler} from "hono";

export const makeAuth: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header("authorization");

  if (!auth?.startsWith("Bearer ")) {
    return c.json({error: "Unauthorized"}, 401);
  }

  const token = auth.slice(7);

  if (token !== c.env.MAKE_API_KEY) {
    return c.json({error: "Unauthorized"}, 401);
  }

  await next();
};
