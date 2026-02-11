import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export function validate(schema: z.ZodType<any, any>, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req[source]);
      (req as any)[`validated${source.charAt(0).toUpperCase() + source.slice(1)}`] = data;
      if (source === 'body') req.body = data;
      if (source === 'query') (req as any).validatedQuery = data;
      next();
    } catch (err) {
      next(err);
    }
  };
}
