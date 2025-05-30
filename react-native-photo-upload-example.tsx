import React, { useState } from 'react';
import { View, Text, Button, Image, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import axios from 'axios';

interface PhotoUploadProps {
  token: string;
  apiUrl: string;
}

const PhotoUpload: React.FC<PhotoUploadProps> = ({ token, apiUrl }) => {
  const [photos, setPhotos] = useState<any[]>([]);
  const [content, setContent] = useState<string>('This is my post content');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<string>('');

  // Function to pick images from gallery
  const pickImages = async () => {
    const options = {
      mediaType: 'photo',
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      selectionLimit: 5, // Allow multiple selection up to 5
    };

    try {
      const result = await launchImageLibrary(options);
      
      if (result.assets && result.assets.length > 0) {
        // Format the selected photos to match the expected format
        const formattedPhotos = result.assets.map(asset => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          filename: asset.fileName || `photo_${Date.now()}.jpg`,
          extension: asset.type?.split('/')[1] || 'jpg',
          fileSize: asset.fileSize,
          playableDuration: null
        }));
        
        setPhotos(formattedPhotos);
      }
    } catch (error) {
      console.error('Error picking images:', error);
    }
  };

  // Function to upload photos and create post
  const uploadPhotos = async () => {
    if (photos.length === 0) {
      setResult('Please select at least one photo');
      return;
    }

    setLoading(true);
    setResult('');

    try {
      // Option 1: Send photos as JSON strings
      const formData = new FormData();
      
      // Add content and visibility
      formData.append('content', content);
      formData.append('visibility', 'PUBLIC');
      
      // Add photos as JSON strings
      photos.forEach(photo => {
        formData.append('photos', JSON.stringify(photo));
      });
      
      // Send the request
      const response = await axios.post(
        `${apiUrl}/api/post`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          }
        }
      );
      
      setResult('Post created successfully!');
      console.log('Response:', response.data);
      
      // Clear photos after successful upload
      setPhotos([]);
    } catch (error) {
      console.error('Error uploading photos:', error);
      setResult(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Alternative approach: Upload photos directly
  const uploadPhotosDirectly = async () => {
    if (photos.length === 0) {
      setResult('Please select at least one photo');
      return;
    }

    setLoading(true);
    setResult('');

    try {
      // Create form data
      const formData = new FormData();
      
      // Add content and visibility
      formData.append('content', content);
      formData.append('visibility', 'PUBLIC');
      
      // Add photos as actual files
      photos.forEach(photo => {
        formData.append('photos', {
          uri: photo.uri,
          type: `image/${photo.extension}`,
          name: photo.filename
        });
      });
      
      // Send the request
      const response = await axios.post(
        `${apiUrl}/api/post`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          }
        }
      );
      
      setResult('Post created successfully!');
      console.log('Response:', response.data);
      
      // Clear photos after successful upload
      setPhotos([]);
    } catch (error) {
      console.error('Error uploading photos directly:', error);
      setResult(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Photo Upload</Text>
      
      <Button title="Pick Images" onPress={pickImages} />
      
      {photos.length > 0 && (
        <View style={styles.photoContainer}>
          <Text style={styles.subtitle}>Selected Photos ({photos.length})</Text>
          <ScrollView horizontal>
            {photos.map((photo, index) => (
              <View key={index} style={styles.photoWrapper}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                <Text style={styles.photoName}>{photo.filename}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
      
      <View style={styles.buttonContainer}>
        <Button 
          title="Upload as JSON" 
          onPress={uploadPhotos} 
          disabled={loading || photos.length === 0} 
        />
        <Button 
          title="Upload Directly" 
          onPress={uploadPhotosDirectly} 
          disabled={loading || photos.length === 0} 
        />
      </View>
      
      {loading && <ActivityIndicator size="large" color="#0000ff" />}
      
      {result !== '' && (
        <Text style={styles.result}>{result}</Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 10,
  },
  photoContainer: {
    marginVertical: 20,
  },
  photoWrapper: {
    marginRight: 10,
    alignItems: 'center',
  },
  photo: {
    width: 150,
    height: 150,
    borderRadius: 10,
  },
  photoName: {
    width: 150,
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 20,
  },
  result: {
    fontSize: 16,
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
  },
});

export default PhotoUpload;