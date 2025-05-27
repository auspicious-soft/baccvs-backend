import multer from "multer";
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { configDotenv } from 'dotenv';
import { Request } from "express";
import path from "path";
import { timeStamp } from "console";

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



