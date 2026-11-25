import * as ImagePicker from 'expo-image-picker';

const CLOUD = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

// Lets the user pick a photo, uploads it straight to Cloudinary,
// and returns the hosted URL to save in MySQL (or null if they cancel).
export async function pickAndUploadImage() {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  });
  if (picked.canceled) return null;

  const asset = picked.assets[0];
  const form = new FormData();
  form.append('file', {
    uri: asset.uri,
    type: asset.mimeType || 'image/jpeg',
    name: asset.fileName || 'upload.jpg',
  });
  form.append('upload_preset', PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Image upload failed');
  return data.secure_url;
}
