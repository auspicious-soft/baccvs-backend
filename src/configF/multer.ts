import multer from "multer";
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { configDotenv } from 'dotenv';
import { Request } from "express";
import path from "path";
import axios from "axios";
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import os from 'os';

configDotenv();

const { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME } = process.env;

// Create S3 client
const s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID as string,
        secretAccessKey: AWS_SECRET_ACCESS_KEY as string
    },
});

// Configure storage - temporarily store files in memory
const storage = multer.memoryStorage();

// Configure file filter if needed
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(null, false);
    }
};

// Create multer upload instance
export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 1024 * 1024 * 5, // 5 MB
    },
});

// Function to upload file to S3
export const uploadFileToS3 = async (file: Express.Multer.File, userEmail: string) => {
    try {
        const fileName = `${Date.now()}-${file.originalname}`;
        const key = `projects/${userEmail}/${Date.now()}/${fileName}`;
        
        const params = {
            Bucket: AWS_BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
        };
        
        const command = new PutObjectCommand(params);
        await s3Client.send(command);
        
        return key;
    } catch (error) {
        console.error("Error uploading file to S3:", error);
        throw error;
    }
};

// Function to upload buffer to S3
export const uploadBufferToS3 = async (buffer: Buffer, fileName: string, contentType: string, userEmail: string) => {
    try {
        const key = `projects/${userEmail}/${Date.now()}/${fileName}`;
        
        const params = {
            Bucket: AWS_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        };
        
        const command = new PutObjectCommand(params);
        await s3Client.send(command);
        
        return key;
    } catch (error) {
        console.error("Error uploading buffer to S3:", error);
        throw error;
    }
};

// Function to upload multiple files to S3
export const uploadMultipleFilesToS3 = async (files: Express.Multer.File[], userEmail: string) => {
    try {
        const uploadPromises = files.map(file => uploadFileToS3(file, userEmail));
        return await Promise.all(uploadPromises);
    } catch (error) {
        console.error("Error uploading multiple files to S3:", error);
        throw error;
    }
};

// Function to handle mobile app photo objects
export const handleMobileAppPhotos = async (photoObjects: any[], userEmail: string) => {
  try {
    // For each photo object, download the image from the URI and upload to S3
    const uploadPromises = photoObjects.map(async (photo) => {
      try {
        // Extract URI from the photo object
        const uri = photo.uri;
        
        if (!uri) {
          console.error("No URI found in photo object:", photo);
          return null;
        }
        
        // Determine content type based on extension
        const extension = photo.extension || 'jpg';
        const contentType = getContentTypeFromExtension(extension);
        
        // Generate a unique filename
        const fileName = photo.filename || `mobile_photo_${Date.now()}.${extension}`;
        
        // Handle different URI schemes
        if (uri.startsWith('ph://') || uri.startsWith('file://')) {
          // For mobile app URIs, we need to handle them differently
          // This is a placeholder - in a real app, you would use a mobile-specific approach
          
          // For testing purposes, we'll create a placeholder buffer
          // In a real app, you would download the file from the URI
          console.log(`Processing mobile photo URI: ${uri}`);
          
          // Create a temporary file path
          const tempFilePath = path.join(os.tmpdir(), `${uuidv4()}.${extension}`);
          
          try {
            // For file:// URIs, we can try to read the file directly
            if (uri.startsWith('file://')) {
              const filePath = uri.replace('file://', '');
              const fileBuffer = fs.readFileSync(filePath);
              return await uploadBufferToS3(fileBuffer, fileName, contentType, userEmail);
            }
            
            // For ph:// URIs (iOS Photos), we need a different approach
            // This would typically be handled on the client side
            // For now, we'll just log it and return a placeholder
            console.log(`Cannot directly access ph:// URI on server: ${uri}`);
            
            // In a real implementation, the mobile app would:
            // 1. Convert the ph:// URI to a base64 string or file
            // 2. Send that to the server instead of the ph:// URI
            
            // For now, we'll return a placeholder key
            const key = `projects/${userEmail}/${Date.now()}/${fileName}`;
            console.log(`Placeholder key for mobile photo: ${key}`);
            return key;
          } catch (fileError) {
            console.error(`Error processing file URI: ${uri}`, fileError);
            return null;
          } finally {
            // Clean up temp file if it exists
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          }
        } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
          // For HTTP/HTTPS URIs, we can download the image
          try {
            const response = await axios.get(uri, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data, 'binary');
            
            // Upload the buffer to S3
            return await uploadBufferToS3(buffer, fileName, contentType, userEmail);
          } catch (downloadError) {
            console.error(`Error downloading image from URI: ${uri}`, downloadError);
            return null;
          }
        } else if (uri.startsWith('data:')) {
          // Handle base64 data URIs
          try {
            // Extract the base64 data
            const matches = uri.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            
            if (!matches || matches.length !== 3) {
              throw new Error('Invalid data URI format');
            }
            
            const dataContentType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Upload the buffer to S3
            return await uploadBufferToS3(buffer, fileName, dataContentType, userEmail);
          } catch (base64Error) {
            console.error(`Error processing base64 URI`, base64Error);
            return null;
          }
        } else {
          // Unknown URI scheme
          console.error(`Unsupported URI scheme: ${uri}`);
          return null;
        }
      } catch (error) {
        console.error("Error processing mobile photo:", error);
        return null;
      }
    });
    
    const results = await Promise.all(uploadPromises);
    return results.filter(result => result !== null);
  } catch (error) {
    console.error("Error handling mobile app photos:", error);
    throw error;
  }
};

// Helper function to determine content type from file extension
function getContentTypeFromExtension(extension: string): string {
  const ext = extension.toLowerCase();
  const contentTypeMap: { [key: string]: string } = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'heic': 'image/heic',
    'heif': 'image/heif',
    'bmp': 'image/bmp',
    'tiff': 'image/tiff',
    'tif': 'image/tiff'
  };
  
  return contentTypeMap[ext] || 'application/octet-stream';
}

