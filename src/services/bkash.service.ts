// src/services/bkash.service.ts
import axios from 'axios';
import { ApiError } from '../utils/ApiError.js';

// 1. bKash Token Generation Service
export const getBkashToken = async (): Promise<string> => {
  try {
    const { data } = await axios.post(
      `${process.env.BKASH_BASE_URL}/tokenized/checkout/token/grant`,
      {
        app_key: process.env.BKASH_APP_KEY,
        app_secret: process.env.BKASH_APP_SECRET,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'username': process.env.BKASH_USERNAME,
          'password': process.env.BKASH_PASSWORD,
        },
      }
    );

    // Check if the response contains the token
    if (data && data.id_token) {
      return data.id_token;
    }
    
    throw new Error('Token not found in response');
  } catch (error: any) {
    console.error('bKash Token Error:', error.response?.data || error.message);
    console.log("BASE URL--->", process.env.BKASH_BASE_URL);
    throw new ApiError(500, 'Failed to authenticate with bKash Gateway');
  }
};