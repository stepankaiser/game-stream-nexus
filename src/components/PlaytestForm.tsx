// src/components/PlaytestForm.tsx (or your actual path)

import React, { useState } from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form"; // Import Controller
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import Tabs components
import { toast } from "sonner";
import FileUpload from './FileUpload';
import SuccessScreen from './SuccessScreen';

// --- CHANGE POINT 1: Update the import ---
// Import the NEW AWS service functions including the email function
import { uploadGameBuildToS3, saveSubmissionToDynamoDB, sendConfirmationEmail } from '@/services/supabase';

// --- CHANGE POINT 1: Update the Form Schema ---
const formSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  country: z.string({ required_error: "Please select your country" }),
  submissionType: z.enum(['upload', 'url']).default('upload'), // Add submission type
  gameFile: z.instanceof(File).optional(), // Make file optional
  gameUrl: z.string().url({ message: "Please enter a valid URL" }).optional(), // Add optional URL field
}).refine(data => {
  // Ensure either file is provided for 'upload' or URL for 'url'
  if (data.submissionType === 'upload') {
    return !!data.gameFile;
  }
  if (data.submissionType === 'url') {
    return !!data.gameUrl;
  }
  return false; // Should not happen if submissionType is correctly set
}, {
  // Custom error message if validation fails
  message: "Please provide either a game build file or a valid URL.",
  // Specify the path to associate the error with (optional, can target a specific field)
  path: ["gameFile"], // Or ["gameUrl"] or a more general path
});


type FormValues = z.infer<typeof formSchema>;

// Comprehensive list of countries for dropdown (remains the same)
const countries = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia",
    // ... (keep the full list) ...
    "Zambia", "Zimbabwe"
].sort();


const PlaytestForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // Keep for upload simulation
  const [submissionType, setSubmissionType] = useState<'upload' | 'url'>('upload'); // State for tabs

  // --- CHANGE POINT 2: Update Form Initialization ---
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      country: "",
      submissionType: 'upload', // Default to upload
      gameFile: undefined,
      gameUrl: "",
    }
  });

  // --- CHANGE POINT 3: Update File/URL Handling ---
  // File selection handler
  const onFileSelect = (file: File | null) => { // Allow null for clearing
    form.setValue("gameFile", file || undefined, { shouldValidate: true });
    if (file) {
      form.setValue("gameUrl", "", { shouldValidate: false }); // Clear URL if file is selected
    }
  };

  // URL change handler
  const onUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    form.setValue("gameUrl", e.target.value, { shouldValidate: true });
    if (e.target.value) {
      form.setValue("gameFile", undefined, { shouldValidate: false }); // Clear file if URL is entered
      // Potentially reset FileUpload component state if it holds internal state
    }
  };

  // --- CHANGE POINT 4: Update onSubmit Logic ---
  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    setUploadProgress(0);

    // Zod schema refinement handles the core validation now

    try {
      let s3Bucket: string | undefined = undefined;
      let s3Key: string | undefined = undefined;
      let fileName: string | undefined = undefined;
      let gameBuildUrl: string | undefined = undefined;

      // --- Step 1: Handle Upload or URL ---
      if (data.submissionType === 'upload' && data.gameFile) {
        // Simulate upload progress
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            const newProgress = prev + Math.random() * 10;
            return newProgress > 90 ? 90 : newProgress; // Cap simulation
          });
        }, 500);

        console.log('Uploading to S3...');
        const uploadResult = await uploadGameBuildToS3(data.gameFile, data.email);
        console.log('S3 Upload Result:', uploadResult);

        clearInterval(progressInterval); // Stop simulation after upload
        setUploadProgress(100); // Mark as complete

        s3Bucket = uploadResult.s3Bucket;
        s3Key = uploadResult.s3Key;
        fileName = uploadResult.fileName;

      } else if (data.submissionType === 'url' && data.gameUrl) {
        console.log('Using provided URL:', data.gameUrl);
        gameBuildUrl = data.gameUrl;
        // No S3 upload, no progress simulation needed for URL
        setUploadProgress(100); // Indicate processing complete immediately
      } else {
        // This case should ideally be caught by Zod refinement, but good to handle
        throw new Error("Invalid submission data. No file or URL provided.");
      }

      // --- Step 2: Save submission data to AWS DynamoDB ---
      // NOTE: saveSubmissionToDynamoDB now handles optional S3/URL details
      console.log('Saving submission to DynamoDB...');
      const dbResult = await saveSubmissionToDynamoDB(
        data.email,
        data.country,
        s3Bucket,
        s3Key,
        fileName,
        gameBuildUrl
      );
      console.log('DynamoDB Save Result:', dbResult);

      // --- Step 3: Send Confirmation Email ---
      if (dbResult.success && dbResult.submissionId) {
        console.log('Sending confirmation email...');
        await sendConfirmationEmail(
          data.email, // Recipient
          dbResult.submissionId, // Submission ID from DB result
          data.submissionType, // 'upload' or 'url'
          { fileName: fileName, gameBuildUrl: gameBuildUrl } // Pass relevant details
        );
        console.log('Confirmation email call completed.');
      } else {
         console.warn('Skipping confirmation email due to DynamoDB save issue or missing submission ID.');
      }


      toast.success("Game build submitted successfully!");
      setIsSuccess(true);

    } catch (error: any) {
      console.error("Error submitting form:", error);
      toast.error(`Submission failed: ${error.message || 'Please try again.'}`);
      setUploadProgress(0); // Reset progress on error
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- CHANGE POINT 5: Update Reset Function ---
  const resetForm = () => {
    form.reset({
      email: "",
      country: "",
      submissionType: 'upload', // Reset to default tab
      gameFile: undefined,
      gameUrl: ""
    });
    setSubmissionType('upload'); // Reset tab state
    // TODO: Add a way to reset the FileUpload component if it has internal state
    setIsSuccess(false);
    setUploadProgress(0);
  };

  // Success screen rendering (remains the same)
  if (isSuccess) {
    return <SuccessScreen email={form.getValues().email} onReset={resetForm} />;
  }

  // Form rendering (JSX remains largely the same, just ensure field names match schema)
  return (
    <Card className="cyber-card max-w-md w-full mx-auto" id="playtestform">
       <CardHeader>
         <CardTitle className="text-2xl cyber-heading">Submit Your Game</CardTitle>
         <CardDescription>
           Fill in the details below to start your game stream testing process
         </CardDescription>
       </CardHeader>

       <Form {...form}>
         {/* Add novalidate to prevent default browser validation interfering with react-hook-form */}
         <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
           <CardContent className="space-y-6">
             {/* Email Field */}
             <FormField
               control={form.control}
               name="email"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel>Email</FormLabel>
                   <FormControl>
                     <Input
                       type="email" // Ensure correct input type
                       placeholder="your.email@example.com"
                       className="cyber-input"
                       {...field}
                     />
                   </FormControl>
                   <FormDescription>
                     We'll send test results to this email
                   </FormDescription>
                   <FormMessage /> {/* Displays Zod validation errors */}
                 </FormItem>
               )}
             />

            {/* Country Field */}
             <FormField
               control={form.control}
               name="country"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel>Region (Country)</FormLabel>
                   {/* Use Select component correctly with react-hook-form */}
                   <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                     <FormControl>
                       <SelectTrigger className="cyber-input">
                         {/* Display selected value or placeholder */}
                         <SelectValue placeholder="Select your country" />
                       </SelectTrigger>
                     </FormControl>
                     <SelectContent className="bg-cyber-dark border border-cyber-purple/30 max-h-80">
                       {countries.map((country) => (
                         <SelectItem key={country} value={country} className="cyber-select-item">
                           {country}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                   <FormDescription>
                     Select the region for optimal streaming performance
                   </FormDescription>
                   <FormMessage />
                 </FormItem>
               )}
             />

             {/* --- CHANGE POINT 6: Add Tabs for Upload/URL --- */}
             <FormField
                control={form.control}
                name="submissionType" // Control the hidden submissionType value
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Submission Method</FormLabel>
                    <FormControl>
                      <Tabs
                        value={submissionType}
                        onValueChange={(value) => {
                          const newType = value as 'upload' | 'url';
                          setSubmissionType(newType);
                          field.onChange(newType); // Update react-hook-form state
                          // Clear the other field when switching tabs
                          if (newType === 'upload') {
                            form.setValue('gameUrl', '', { shouldValidate: false });
                          } else {
                            form.setValue('gameFile', undefined, { shouldValidate: false });
                            // TODO: Reset FileUpload component state if needed
                          }
                          form.clearErrors(['gameFile', 'gameUrl']); // Clear errors on switch
                        }}
                        className="w-full"
                      >
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="upload">Upload File</TabsTrigger>
                          <TabsTrigger value="url">Provide URL</TabsTrigger>
                        </TabsList>
                        <TabsContent value="upload" className="mt-4">
                          {/* File Upload Field (Conditional) */}
                          <FormField
                            control={form.control}
                            name="gameFile"
                            render={({ fieldState }) => (
                              <FormItem>
                                <FormLabel className="sr-only">Game Build File</FormLabel>
                                <FormControl>
                                  <FileUpload onFileSelect={onFileSelect} />
                                </FormControl>
                                <FormDescription>
                                  Upload your game build file (.zip, .rar, .7z, .exe, .dmg)
                                </FormDescription>
                                <FormMessage>{fieldState.error?.message}</FormMessage>
                              </FormItem>
                            )}
                          />
                        </TabsContent>
                        <TabsContent value="url" className="mt-4">
                          {/* URL Input Field (Conditional) */}
                          <FormField
                            control={form.control}
                            name="gameUrl"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Game Build URL</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="https://your-storage-provider.com/build.zip"
                                    className="cyber-input"
                                    {...field}
                                    onChange={(e) => {
                                        field.onChange(e); // RHF internal update
                                        onUrlChange(e); // Custom handler to clear file
                                    }}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Provide a direct download link (e.g., S3, Google Drive).
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TabsContent>
                      </Tabs>
                    </FormControl>
                    {/* Display the combined error message from the refinement */}
                    <FormMessage>{form.formState.errors.gameFile?.message}</FormMessage>
                  </FormItem>
                )}
              />


             {/* Progress Bar - Show only for upload type */}
             {isSubmitting && submissionType === 'upload' && uploadProgress > 0 && (
               <div className="w-full pt-4">
                 <div className="h-2 w-full bg-cyber-dark rounded-full overflow-hidden">
                   <div
                     className="h-full bg-cyber-neon-purple transition-all duration-300 ease-out"
                     style={{ width: `${uploadProgress}%` }}
                   />
                 </div>
                 <p className="text-xs text-right mt-1 text-muted-foreground">
                   {uploadProgress < 100 ? 'Uploading...' : 'Processing...'}
                 </p>
               </div>
             )}
           </CardContent>

           <CardFooter>
             <Button
               type="submit"
               className="cyber-button w-full"
               disabled={isSubmitting} // Disable button while submitting
             >
               {isSubmitting ? "Submitting..." : "Submit Game Build"}
             </Button>
           </CardFooter>
         </form>
       </Form>
     </Card>
  );
};

export default PlaytestForm;
