import { S3Client, PutObjectCommand, DeleteObjectsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { configDotenv } from 'dotenv';
import { Readable } from 'stream';
configDotenv()

const { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME } = process.env;

export const createS3Client = () => {
    return new S3Client({
        region: AWS_REGION,
        credentials: {
            accessKeyId: AWS_ACCESS_KEY_ID as string,
            secretAccessKey: AWS_SECRET_ACCESS_KEY as string
        },
    });
}

export const generateSignedUrlToUploadOn = async (fileName: string, fileType: string, userEmail: string) => {
    const uploadParams = {
        Bucket: AWS_BUCKET_NAME,
        Key: `projects/${userEmail}/my-projects/${fileName}`,
        ContentType: fileType,
    }
    try {
        const command = new PutObjectCommand(uploadParams);
        const signedUrl = await getSignedUrl(createS3Client(), command);
        return signedUrl;
    } catch (error) {
        console.error("Error generating signed URL:", error);
        throw error;
    }
}

export const generateMultipleSignedUrls = async (files: Array<{name: string, type: string}>, userEmail: string) => {
    try {
        const signedUrls = await Promise.all(
            files.map(async (file) => {
                const fileName = `${Date.now()}-${file.name}`;
                const signedUrl = await generateSignedUrlToUploadOn(fileName, file.type, userEmail);
                return {
                    fileName: `projects/${userEmail}/my-projects/${fileName}`,
                    signedUrl,
                    originalName: file.name
                };
            })
        );
        return signedUrls;
    } catch (error) {
        console.error("Error generating multiple signed URLs:", error);
        throw error;
    }
}

export const uploadStreamToS3Service = async (
  fileStream: Readable,
  fileName: string,
  fileType: string,
  userEmail: string
): Promise<string> => {
  const timestamp = Date.now();
  const imageKey = `users/${userEmail}/${fileType}/${timestamp}-${fileName}`;
  
  // Convert stream to buffer
  const chunks: any[] = [];
  for await (const chunk of fileStream) {
    chunks.push(chunk);
  }
  const fileBuffer = Buffer.concat(chunks);
  
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: imageKey,
    Body: fileBuffer,
    ContentType: fileType,
  };
  
  const s3Client = createS3Client();
  const command = new PutObjectCommand(params);
  await s3Client.send(command);
  
  return imageKey;
};

export const extractS3Key = (urlOrKey: string): string | null => {
  try {
    // If it starts with 'users/' or 'projects/', it's already a key
    if (urlOrKey.startsWith('users/') || urlOrKey.startsWith('projects/')) {
      return urlOrKey;
    }
    
    // If it's a full URL, extract the key
    if (urlOrKey.startsWith('http')) {
      const bucketPath = process.env.NEXT_PUBLIC_AWS_BUCKET_PATH;
      if (bucketPath && urlOrKey.startsWith(bucketPath)) {
        // Remove bucket path to get the key
        const key = urlOrKey.replace(bucketPath, '');
        return key.startsWith('/') ? key.substring(1) : key;
      }
      
      // Fallback: extract from URL pathname
      const url = new URL(urlOrKey);
      return url.pathname.substring(1); // Remove leading '/'
    }
    
    // If it doesn't match expected patterns, assume it's already a key
    return urlOrKey;
  } catch (error) {
    console.error('Error extracting S3 key:', error);
    return null;
  }
};

/**
 * Delete a single file from S3
 * @param s3Key - The S3 key of the file to delete
 * @returns Promise<boolean> - Returns true if successful, false otherwise
 */
export const deleteFileFromS3 = async (s3Key: string): Promise<boolean> => {
  try {
    const s3Client = createS3Client();
    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!, // This should be just the bucket name, not the full path
      Key: s3Key,
    });

    await s3Client.send(deleteCommand);
    console.log(`Successfully deleted file from S3: ${s3Key}`);
    return true;
    
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    return false;
  }
};

/**
 * Delete multiple files from S3
 * @param s3Keys - Array of S3 keys to delete
 * @returns Promise<{successful: string[], failed: string[]}> - Returns arrays of successful and failed deletions
 */
export const deleteMultipleFilesFromS3 = async (s3Keys: string[]): Promise<{successful: string[], failed: string[]}> => {
  try {
    const s3Client = createS3Client();
    
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Delete: {
        Objects: s3Keys.map(key => ({ Key: key })),
        Quiet: false,
      },
    });

    const response = await s3Client.send(deleteCommand);
    
    const successful = response.Deleted?.map(obj => obj.Key!) || [];
    const failed = response.Errors?.map(err => err.Key!) || [];
    
    console.log(`Successfully deleted ${successful.length} files from S3`);
    if (failed.length > 0) {
      console.error(`Failed to delete ${failed.length} files from S3:`, failed);
    }
    
    return { successful, failed };
    
  } catch (error) {
    console.error('Error deleting multiple files from S3:', error);
    return { successful: [], failed: s3Keys };
  }
};