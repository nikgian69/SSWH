import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
export declare function validate(schema: z.ZodType<any, any>, source?: 'body' | 'query' | 'params'): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=validation.d.ts.map