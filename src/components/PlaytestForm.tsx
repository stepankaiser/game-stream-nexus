// src/components/PlaytestForm.tsx (or your actual path)

import React, { useState, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FileUpload from '@/components/FileUpload';
import { countries } from '@/lib/countries';
import { 
    saveSubmissionToDynamoDB,
    createGameLiftApplication,
    sendConfirmationEmail 
} from '@/services/supabase';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// -- Start Schema Refactor --
const baseSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  country: z.string().min(1, { message: "Country is required" }),
  submissionType: z.enum(['upload', 'url']),
});

const uploadSchema = baseSchema.extend({
  submissionType: z.literal('upload'),
  gameFile: z.any().refine(files => !!files, { 
    message: "A game build folder is required for upload submissions",
  }),
  executableName: z.string().min(1, { message: "Executable name is required" }).default("MyProject.exe"),
  gameUrl: z.string().optional(),
});

const urlSchema = baseSchema.extend({
  submissionType: z.literal('url'),
  gameFile: z.any().optional(), // Keep optional here, won't be validated
  // Require non-empty URL for url submissions
  gameUrl: z.string().url({ message: "Invalid URL" }).min(1, { message: "Game URL is required for URL submissions" }),
});

// Use discriminatedUnion based on submissionType
const playtestSchema = z.discriminatedUnion("submissionType", [
  uploadSchema,
  urlSchema
]);
// -- End Schema Refactor --

/* 
// Old Schema:
const playtestSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  country: z.string().min(1, { message: "Country is required" }),
  submissionType: z.enum(['upload', 'url']),
  gameFile: z.any().optional(), 
  gameUrl: z.string().url({ message: "Invalid URL" }).optional(),
}).refine(data => {
    if (data.submissionType === 'upload') {
      return !!data.gameFile;
    } 
    return true;
  }, {
    message: "A game build folder is required for upload submissions",
    path: ["gameFile"],
  })
  .refine(data => data.submissionType === 'url' ? !!data.gameUrl : true, {
    message: "Game URL is required for URL submissions",
    path: ["gameUrl"], 
  });
*/

type PlaytestFormData = {
  email: string;
  country: string;
  submissionType: 'upload' | 'url';
  gameFile: FileList | null;
  gameUrl?: string;
  executableName?: string;
};

// --- Get API Gateway URLs from environment ---
const presignedUrlApiEndpoint = import.meta.env.VITE_PRESIGNED_URL_API;
const provisioningApiEndpoint = import.meta.env.VITE_PROVISIONING_API_ENDPOINT;

if (!presignedUrlApiEndpoint) {
    console.error("VITE_PRESIGNED_URL_API environment variable is not set! Uploads will fail.");
    // Consider adding UI feedback here
}
if (!provisioningApiEndpoint) {
    console.error("VITE_PROVISIONING_API_ENDPOINT environment variable is not set! Provisioning trigger will fail.");
}

const PlaytestForm: React.FC = () => {
  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isValid },
    reset,
  } = useForm<PlaytestFormData>({
    resolver: zodResolver(playtestSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      country: '',
      submissionType: 'upload',
      gameFile: null,
      gameUrl: '',
      executableName: 'MyProject.exe',
    },
  });

  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileProgress, setFileProgress] = useState<{ [key: string]: { loaded: number, total: number } }>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const submissionType = watch('submissionType');
  const gameFileValue = watch('gameFile');

  // Calculate overall progress
   const overallProgress = useMemo(() => {
        const files = Object.values(fileProgress);
        if (files.length === 0) return 0;
        const totalSize = files.reduce((sum, file) => sum + (file.total || 0), 0);
        const totalLoaded = files.reduce((sum, file) => sum + (file.loaded || 0), 0);
        return totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0;
    }, [fileProgress]);

  // --- NEW: Function to get Presigned URL ---
  const getPresignedUrl = async (objectKey: string, contentType: string): Promise<string> => {
      if (!presignedUrlApiEndpoint) {
           throw new Error("API endpoint for presigned URL is not configured.");
      }
      console.log(`Requesting presigned URL for key: ${objectKey}, type: ${contentType}`);
      const response = await fetch(presignedUrlApiEndpoint, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({ objectKey, contentType }),
      });

      if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          console.error("Error response from presigned URL API:", response.status, errorBody);
          throw new Error(`Failed to get presigned URL: ${response.statusText} - ${errorBody.details || 'Unknown error'}`);
      }

      const data = await response.json();
      if (!data.presignedUrl) {
           console.error("Presigned URL missing from API response:", data);
          throw new Error("Presigned URL was not returned from the API.");
      }
      console.log(`Received presigned URL successfully for ${objectKey}`);
      return data.presignedUrl;
  };

  // --- NEW: Function to upload a single file using fetch ---
  const uploadFileWithPresignedUrl = async (file: File, targetS3Key: string) => {
       try {
           const presignedUrl = await getPresignedUrl(targetS3Key, file.type || 'application/octet-stream');

           setStatusMessage(`Uploading: ${file.webkitRelativePath || file.name}`);
           setFileProgress(prev => ({ ...prev, [targetS3Key]: { loaded: 0, total: file.size } }));

           await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('PUT', presignedUrl, true);
              xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

              xhr.upload.onprogress = (event) => {
                  if (event.lengthComputable) {
                      // console.log(`Upload Progress (${targetS3Key}): ${Math.round((event.loaded / event.total) * 100)}%`);
                      setFileProgress(prev => ({
                          ...prev,
                          [targetS3Key]: { loaded: event.loaded, total: event.total }
                      }));
                  }
              };

              xhr.onload = () => {
                  if (xhr.status >= 200 && xhr.status < 300) {
                      console.log(`Successfully uploaded ${targetS3Key}`);
                      // Final update to ensure 100% for this file
                       setFileProgress(prev => ({
                           ...prev,
                           [targetS3Key]: { loaded: file.size, total: file.size }
                       }));
                      resolve();
                  } else {
                       console.error(`Upload failed for ${targetS3Key}: ${xhr.status} ${xhr.statusText}`, xhr.responseText);
                       reject(new Error(`Upload failed for ${file.webkitRelativePath || file.name}: ${xhr.status} ${xhr.statusText}`));
                  }
              };

              xhr.onerror = () => {
                  console.error(`Network error during upload for ${targetS3Key}`);
                   setFileProgress(prev => ({ ...prev, [targetS3Key]: { loaded: -1, total: file.size } })); // Indicate error
                  reject(new Error('Network error during upload.'));
              };

              xhr.send(file);
           });

       } catch (error) {
          console.error(`Error during upload process for ${targetS3Key}:`, error);
           setStatusMessage(`Failed to upload ${file.webkitRelativePath || file.name}.`);
            setFileProgress(prev => ({ ...prev, [targetS3Key]: { loaded: -1, total: file.size } })); // Indicate error
           throw error; // Re-throw to stop onSubmit
       }
  };

  const onSubmit = async (data: PlaytestFormData) => {
    console.log('onSubmit triggered!');
    console.log('Form data received:', data);
    setIsLoading(true);
    setSubmissionError(null);
    setStatusMessage('Preparing submission...');
    setUploadProgress(0);
    setFileProgress({});

    try {
      console.log('Zod validation passed.');

      const submissionId = uuidv4();
      let gameBuildS3UriPrefix = '';
      let originalFileName = '';
      let executablePath = '';

      if (data.submissionType === 'upload') {
        if (!(data.gameFile instanceof FileList && data.gameFile.length > 0)) {
          throw new Error("Invalid or empty game build folder selected.");
        }
        
        const files = data.gameFile as FileList;
        const firstFilePath = files[0].webkitRelativePath;
        const rootFolderName = firstFilePath.split('/')[0] || `game-build-${submissionId}`;
        originalFileName = rootFolderName;
        gameBuildS3UriPrefix = `s3://${import.meta.env.VITE_S3_BUCKET_NAME}/game-builds/${submissionId}/`;
        executablePath = `${rootFolderName}/${data.executableName}`;

        console.log(`Processing ${files.length} files from folder: ${rootFolderName}`);
        setStatusMessage(`Preparing to upload ${files.length} files...`);

        const uploadPromises: Promise<void>[] = [];
        const validFilesToUpload: File[] = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const relativePath = file.webkitRelativePath;

          if ((file.size === 0 && relativePath.endsWith('/')) || relativePath.startsWith('__MACOSX/')) {
             console.log(` -> Skipping: ${relativePath}`);
             continue; 
          }
          validFilesToUpload.push(file);

          const targetS3Key = `game-builds/${submissionId}/${relativePath}`;
          console.log(` -> Queuing upload for: ${relativePath} to ${targetS3Key}`);

          uploadPromises.push(
            uploadFileWithPresignedUrl(file, targetS3Key)
          );
        }

        if (uploadPromises.length === 0) {
          throw new Error("No valid files found in the selected folder to upload.");
        }

        console.log(`Starting upload of ${uploadPromises.length} files...`);
        setStatusMessage(`Uploading ${uploadPromises.length} files...`);
        await Promise.all(uploadPromises);

        setStatusMessage('Upload complete! Saving submission...');
        console.log('Finished uploading all files.');
        console.log('All files uploaded successfully!');
      } else if (data.submissionType === 'url' && data.gameUrl) {
        originalFileName = data.gameUrl;
        setStatusMessage('Processing URL submission...');
      } else {
        throw new Error('Invalid submission state.');
      }

      // Determine s3Uri or gameUrl based on submissionType
      let submissionData: any = {
        submissionId,
        email: data.email,
        country: data.country,
        submissionType: data.submissionType,
        status: 'UPLOADED', // Initial status
        createdAt: new Date().toISOString(),
      };

      if (data.submissionType === 'upload') {
          submissionData.s3BuildUri = gameBuildS3UriPrefix;
          submissionData.originalFileName = originalFileName;
      } else { // submissionType === 'url'
          // submissionData.gameUrl = data.gameUrl;
          setStatusMessage('Processing URL submission...');
          console.log('Processing URL submission.');
      }

      // --- Save initial submission data to DB (Using original signature) --- 
      setStatusMessage('Saving submission details...');
      console.log('Saving initial submission data with ID:', submissionId);
      const dynamoResult = await saveSubmissionToDynamoDB(
        submissionId, 
        data.email, 
        data.country,
        originalFileName,
        data.submissionType === 'upload' ? gameBuildS3UriPrefix : data.gameUrl,
        executablePath  // Use the defined executablePath
      );
      console.log('Submission save result:', dynamoResult);
      // Add success/error check if dynamoResult provides it
      // if (!dynamoResult.success) {
      //   throw new Error(`Failed to save submission: ${dynamoResult.error}`);
      // }
      console.log('Initial submission data saved successfully.');

      // --- Trigger Backend Provisioning --- 
      if (provisioningApiEndpoint && data.submissionType === 'upload') { // Only trigger for uploads and if configured
          try {
              setStatusMessage('Starting game provisioning...'); // Optional status update
              console.log(`Triggering provisioning for submissionId: ${submissionId}`);

              const provisionResponse = await fetch(provisioningApiEndpoint, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ submissionId: submissionId }),
              });

              if (!provisionResponse.ok) {
                  const errorBody = await provisionResponse.json().catch(() => ({}));
                  console.error("Error response from provisioning API:", provisionResponse.status, errorBody);
                  // Decide how critical this is - maybe just warn the user?
                  setStatusMessage('Upload complete, but provisioning trigger failed. Please contact support.');
              } else {
                  const provisionResult = await provisionResponse.json();
                  console.log("Provisioning triggered successfully:", provisionResult);
              }
          } catch (provisionError: any) {
              console.error("Error calling provisioning API:", provisionError);
              setStatusMessage('Upload complete, but failed to contact provisioning service. Please contact support.');
          }
      } else if (data.submissionType === 'upload'){
           setStatusMessage('Upload complete, but provisioning endpoint not configured.');
           console.warn("Provisioning endpoint not configured. Skipping trigger.");
      }

      // After successful DynamoDB save, send confirmation email
      try {
        await sendConfirmationEmail(
          data.email,
          submissionId,
          data.submissionType,
          {
            fileName: data.submissionType === 'upload' ? originalFileName : undefined,
            gameBuildUrl: data.submissionType === 'url' ? data.gameUrl : undefined
          }
        );
        console.log('Confirmation email sent successfully');
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
        // Don't fail the submission if email fails
      }

      // --- Navigate directly to Stream page --- 
      setStatusMessage('Submission successful! Redirecting to stream page...');
      console.log(`onSubmit completed successfully. Navigating to /stream/${submissionId}`);
      reset(); // Reset form after successful submission
      navigate(`/stream/${submissionId}`); // NEW: Navigate directly to stream page

    } catch (error: any) {
      console.error('Submission failed:', error);
      setSubmissionError(`Submission failed: ${error.message}`);
      setStatusMessage('Submission failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-lg mx-auto p-8 bg-cyber-dark shadow-lg rounded-lg border border-cyber-purple/30">
      <h2 className="text-2xl font-bold text-center text-cyber-neon-blue mb-6">Game Playtest Submission</h2>

      <div>
        <Label htmlFor="email" className="text-cyber-light">Email Address</Label>
        <Input id="email" type="email" {...register('email')} className="mt-1 bg-input border-cyber-purple/50 focus:border-cyber-neon-blue" />
        {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
      </div>

      <div>
          <Label htmlFor="country" className="text-cyber-light">Country</Label>
          <Controller
            name="country"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <Select 
                onValueChange={field.onChange}
                value={field.value}
              >
                <SelectTrigger className="w-full mt-1 bg-input border-cyber-purple/50 focus:border-cyber-neon-blue">
                  <SelectValue placeholder="Select your country" />
                </SelectTrigger>
                <SelectContent className="bg-cyber-dark border-cyber-purple/50 max-h-60">
                  {countries.map((country) => (
                    <SelectItem key={country.code} value={country.name} className="hover:bg-cyber-purple/30 focus:bg-cyber-purple/40">
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.country && <p className="text-red-500 text-sm mt-1">{errors.country.message}</p>}
      </div>

      <div>
        <Label htmlFor="submissionType" className="text-cyber-light">Submission Type</Label>
        <Controller
          name="submissionType"
          control={control}
          render={({ field }) => (
            <Select 
              onValueChange={field.onChange} 
              value={field.value}
            >
              <SelectTrigger className="w-full mt-1 bg-input border-cyber-purple/50 focus:border-cyber-neon-blue">
                <SelectValue placeholder="Select submission type" />
              </SelectTrigger>
              <SelectContent className="bg-cyber-dark border-cyber-purple/50">
                <SelectItem value="upload" className="hover:bg-cyber-purple/30 focus:bg-cyber-purple/40">Upload Game Build Folder</SelectItem>
                <SelectItem value="url" className="hover:bg-cyber-purple/30 focus:bg-cyber-purple/40">Provide Game Build URL</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {submissionType === 'upload' && (
        <>
          <div>
            <Label htmlFor="gameFile" className="text-cyber-light">Game Build Folder</Label>
            <Controller
              name="gameFile"
              control={control}
              render={({ field: { onChange, value } }) => {
                const handleChange = (files: FileList | null) => {
                  console.log('Controller onChange called with:', files);
                  onChange(files);
                };
                return (
                  <FileUpload 
                    onChange={handleChange}
                    value={value}
                    className="mt-1" 
                  />
                );
              }}
            />
            {errors.gameFile && (
              <p className="text-red-500 text-sm mt-1">{typeof errors.gameFile.message === 'string' ? errors.gameFile.message : 'Invalid input'}</p>
            )}
          </div>
          <div>
            <Label htmlFor="executableName" className="text-cyber-light">Executable Name</Label>
            <Input 
              id="executableName" 
              {...register('executableName')} 
              placeholder="MyProject.exe"
              className="mt-1 bg-input border-cyber-purple/50 focus:border-cyber-neon-blue" 
            />
            {errors.executableName && (
              <p className="text-red-500 text-sm mt-1">{errors.executableName.message}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">The name of your game's executable file (e.g., MyProject.exe)</p>
          </div>
        </>
      )}

      {submissionType === 'url' && (
        <div>
          <Label htmlFor="gameUrl" className="text-cyber-light">Game Build URL</Label>
          <Input id="gameUrl" type="url" {...register('gameUrl')} placeholder="https://..." className="mt-1 bg-input border-cyber-purple/50 focus:border-cyber-neon-blue" />
          {errors.gameUrl && <p className="text-red-500 text-sm mt-1">{errors.gameUrl.message}</p>}
        </div>
      )}

      {isLoading && submissionType === 'upload' && overallProgress > 0 && (
        <div className="my-4">
          <p className="text-sm text-muted-foreground mb-1">{statusMessage || 'Uploading...'}</p>
          <Progress value={overallProgress} className="w-full" />
        </div>
      )}

      <Button type="submit" disabled={isLoading /* || !isValid */} className="w-full bg-cyber-neon-blue hover:bg-cyber-neon-purple text-black font-bold disabled:opacity-50 disabled:cursor-not-allowed">
        {isLoading ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Please wait...</>
        ) : (
          'Submit Playtest Build'
        )}
      </Button>

      {submissionError && !isLoading && (
        <p className="text-red-500 text-sm mt-4 text-center">{submissionError}</p>
      )}
    </form>
  );
};

export default PlaytestForm;
