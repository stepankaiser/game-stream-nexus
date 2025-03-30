// src/components/PlaytestForm.tsx (or your actual path)

import React, { useState } from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import FileUpload from './FileUpload'; // Assuming FileUpload component is correctly handling file selection
import SuccessScreen from './SuccessScreen'; // Assuming SuccessScreen component is fine

// --- CHANGE POINT 1: Update the import ---
// Import the NEW AWS service functions instead of the Supabase ones
// Adjust the path '/services/awsService' if your file is located elsewhere
import { uploadGameBuildToS3, saveSubmissionToDynamoDB } from '@/services/supabase'; // Changed from '@/services/supabase'

// Form schema validation (remains the same)
const formSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  country: z.string({ required_error: "Please select your country" }),
  gameFile: z.instanceof(File, { message: "Please upload your game build" })
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
  // Note: This progress simulation doesn't reflect actual S3 upload progress.
  // Real S3 progress requires using @aws-sdk/lib-storage Upload class.
  const [uploadProgress, setUploadProgress] = useState(0);

  // Initialize form (remains the same)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      country: "",
      // gameFile: undefined // It's often better to let FileUpload handle the initial state
    }
  });

  // File selection handler (remains the same)
  const onFileSelect = (file: File) => {
    form.setValue("gameFile", file, { shouldValidate: true });
  };

  // --- CHANGE POINT 2: Update the onSubmit function ---
  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    setUploadProgress(0); // Reset progress simulation

    // Validate again just before submission (optional but good practice)
    const validation = formSchema.safeParse(data);
    if (!validation.success) {
        toast.error("Please fix the errors in the form.");
        setIsSubmitting(false);
        return;
    }
    // Ensure gameFile is present (Zod validation should catch this, but belt-and-suspenders)
    if (!data.gameFile) {
        toast.error("Game file is missing.");
        form.setError("gameFile", {type: "manual", message: "Please upload your game build"});
        setIsSubmitting(false);
        return;
    }


    try {
      // Simulate upload progress (remains the same simulation)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const newProgress = prev + Math.random() * 10;
          return newProgress > 90 ? 90 : newProgress; // Cap simulation before completion
        });
      }, 500);

      // --- Step 1: Upload file to AWS S3 ---
      // Call the new S3 upload function
      console.log('Uploading to S3...');
      const uploadResult = await uploadGameBuildToS3(data.gameFile, data.email);
      console.log('S3 Upload Result:', uploadResult);


      // --- Step 2: Save submission data to AWS DynamoDB ---
      // Call the new DynamoDB save function, passing S3 details from the upload result
      console.log('Saving submission to DynamoDB...');
      await saveSubmissionToDynamoDB(
        data.email,
        data.country,
        uploadResult.s3Bucket, // Pass bucket from S3 result
        uploadResult.s3Key,    // Pass key from S3 result
        uploadResult.fileName  // Pass filename from S3 result (or use data.gameFile.name if preferred)
      );
      console.log('DynamoDB Save Result: Success (no data returned by default)');

      // Complete the progress bar simulation
      clearInterval(progressInterval);
      setUploadProgress(100);

      // Show success toast (remains the same)
      toast.success("Game build submitted successfully!");

      // Set success state (remains the same)
      setIsSuccess(true);

    } catch (error: any) { // Catch specific errors if needed
      console.error("Error submitting form:", error);
      // Provide a more user-friendly error message
      toast.error(`Submission failed: ${error.message || 'Please try again.'}`);
      // Stop progress simulation on error
      setUploadProgress(0);

    } finally {
      setIsSubmitting(false); // Ensure loading state is turned off
    }
  };

  // Reset form function (remains the same)
  const resetForm = () => {
    form.reset({ email: "", country: "" }); // Reset form values
    // If FileUpload component needs a reset prop/method, call it here too
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

             {/* Game File Field */}
             <FormField
               control={form.control}
               name="gameFile" // This name MUST match the schema
               render={({ fieldState }) => ( // We don't need field render props directly if FileUpload handles it
                 <FormItem>
                   <FormLabel>Game Build</FormLabel>
                   <FormControl>
                      {/* Pass onFileSelect to FileUpload component */}
                     <FileUpload onFileSelect={onFileSelect} />
                   </FormControl>
                   <FormDescription>
                     Upload your game build file (.zip, .rar, .7z, .exe, .dmg)
                   </FormDescription>
                   {/* Manually display error if needed, or let FormMessage handle it via fieldState */}
                   <FormMessage>{fieldState.error?.message}</FormMessage>
                 </FormItem>
               )}
             />

             {/* Progress Bar (remains the same simulation) */}
             {isSubmitting && uploadProgress > 0 && (
               <div className="w-full">
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