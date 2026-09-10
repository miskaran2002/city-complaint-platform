// src/middlewares/upload.ts
import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

// Memory storage configuration for multer
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: Function) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Only .jpg, .jpeg, .png and .webp formats are allowed!'), false);
  }
};

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Maximum 5 MB
  fileFilter,
});