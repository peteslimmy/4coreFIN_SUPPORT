import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

/** Express middleware that validates `req.body` against a Zod schema. */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const first = result.error.issues[0];
      const message = first
        ? `${first.path.join('.') || 'body'}: ${first.message}`
        : 'Invalid request body';
      return res.status(400).json({ error: message });
    }
    req.body = result.data;
    next();
  };
}
