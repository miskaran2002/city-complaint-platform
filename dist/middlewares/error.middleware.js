export const globalErrorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Something went wrong';
    const errors = err.errors || [];
    return res.status(statusCode).json({
        success: false,
        message,
        errors,
    });
};
