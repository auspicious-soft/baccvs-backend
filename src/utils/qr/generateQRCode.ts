import QRCode from 'qrcode';
import crypto from 'crypto'

export const generateQRCode = async (data : any) => {
  try {
    // Create a unique hash to prevent forgery
    const hashData = JSON.stringify(data);
    const hash = crypto.createHash('sha256').update(hashData).digest('hex');
    
    // Create the payload with validation data and hash
    const payload = {
      ...data,
      hash,
      // Add unique identifier to prevent duplicate QR codes
      uuid: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
    };
    
    // Convert payload to a JSON string
    const jsonPayload = JSON.stringify(payload);
    
    // Generate QR code as base64 string
    const qrCodeDataUrl = await QRCode.toDataURL(jsonPayload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 300
    });
    
    // Return the data URL that can be directly used in an <img> tag
    return qrCodeDataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
};