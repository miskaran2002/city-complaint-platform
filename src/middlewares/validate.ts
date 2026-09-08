import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export const validate =
  (schema: ZodSchema) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error: any) {
      const formattedErrors =
        error.errors?.map((err: any) => ({
          field: err.path.join('.').replace('body.', ''),
          message: err.message,
        })) || [];

      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: formattedErrors,
      });
    }
  };