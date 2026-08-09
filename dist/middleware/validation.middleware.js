"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const zod_1 = require("zod");
const validate = (schema) => {
    return async (req, res, next) => {
        try {
            const parsed = await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            // Replace req properties with validated/parsed results
            req.body = parsed.body || req.body;
            req.query = parsed.query || req.query;
            req.params = parsed.params || req.params;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                res.status(400).json({
                    success: false,
                    error: {
                        message: 'Validation failed',
                        details: error.errors.map(err => ({
                            field: err.path.slice(1).join('.'),
                            message: err.message,
                        })),
                    },
                });
                return;
            }
            next(error);
        }
    };
};
exports.validate = validate;
