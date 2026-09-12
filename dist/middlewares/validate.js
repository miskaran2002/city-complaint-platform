export const validate = (schema) => async (req, res, next) => {
    try {
        await schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        return next();
    }
    catch (error) {
        const formattedErrors = error.errors?.map((err) => ({
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
