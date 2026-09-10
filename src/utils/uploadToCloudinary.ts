// src/utils/uploadToCloudinary.ts
import cloudinary from '../config/cloudinary.js';

export const uploadToCloudinary = (fileBuffer: Buffer, folder: string = 'city-complaints'): Promise<string> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) reject(error);
        else resolve(result!.secure_url);
      }
    );
    uploadStream.end(fileBuffer);
  });
};