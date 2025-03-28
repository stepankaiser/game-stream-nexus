
import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client with fallback values if environment variables are not available
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zpifdwfhhnrtjejogjzm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaWZkd2ZoaG5ydGplam9nanptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMxNjA5NTgsImV4cCI6MjA1ODczNjk1OH0.zcvjVgoafjulDr8G1hcZTbz6ZT3nmFidz1IYUkIfk30';

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Function to upload a file to Supabase Storage
export const uploadGameBuild = async (file: File, email: string) => {
  try {
    // Create a unique file path using email and timestamp
    const timestamp = new Date().getTime();
    const fileExt = file.name.split('.').pop();
    const fileName = `${email.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.${fileExt}`;
    const filePath = `game-builds/${fileName}`;

    // Upload the file
    const { data, error } = await supabase.storage
      .from('game-builds')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;
    
    return { filePath: data?.path, fileName };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

// Function to save submission data to Supabase
export const saveSubmission = async (
  email: string, 
  country: string, 
  filePath: string, 
  fileName: string
) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .insert([
        { 
          email, 
          country, 
          file_path: filePath,
          file_name: fileName,
          status: 'pending',
          submitted_at: new Date().toISOString()
        }
      ]);

    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Error saving submission:', error);
    throw error;
  }
};
