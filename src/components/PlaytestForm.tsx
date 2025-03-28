
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
import FileUpload from './FileUpload';
import SuccessScreen from './SuccessScreen';

// Form schema validation
const formSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  country: z.string({ required_error: "Please select your country" }),
  gameFile: z.instanceof(File, { message: "Please upload your game build" })
});

type FormValues = z.infer<typeof formSchema>;

// List of countries for dropdown
const countries = [
  "United States", "Canada", "United Kingdom", "Australia", "Germany", 
  "France", "Japan", "Brazil", "India", "South Korea", "China", "Russia", 
  "Mexico", "Spain", "Italy", "Netherlands", "Sweden", "Norway", "Denmark", 
  "Finland", "Poland", "Singapore", "Argentina", "Chile", "South Africa"
].sort();

const PlaytestForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Initialize form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      country: "",
    }
  });

  const onFileSelect = (file: File) => {
    form.setValue("gameFile", file, { shouldValidate: true });
  };

  // Form submission handler
  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    
    try {
      console.log("Form data:", data);
      
      // Simulate API call (in a real app, this would be a fetch to your backend)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Show success toast
      toast.success("Game build submitted successfully!");
      
      // Set success state
      setIsSuccess(true);
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("There was an error submitting your game build. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const resetForm = () => {
    form.reset();
    setIsSuccess(false);
  };

  // If submission was successful, show success screen
  if (isSuccess) {
    return <SuccessScreen email={form.getValues().email} onReset={resetForm} />;
  }

  return (
    <Card className="cyber-card max-w-md w-full mx-auto" id="playtestform">
      <CardHeader>
        <CardTitle className="text-2xl cyber-heading">Submit Your Game</CardTitle>
        <CardDescription>
          Fill in the details below to start your game stream testing process
        </CardDescription>
      </CardHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="your.email@example.com" 
                      className="cyber-input" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    We'll send test results to this email
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Region (Country)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="cyber-input">
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
            
            <FormField
              control={form.control}
              name="gameFile"
              render={() => (
                <FormItem>
                  <FormLabel>Game Build</FormLabel>
                  <FormControl>
                    <FileUpload onFileSelect={onFileSelect} />
                  </FormControl>
                  <FormDescription>
                    Upload your game build file (.zip, .rar, .7z, .exe, .dmg)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          
          <CardFooter>
            <Button 
              type="submit" 
              className="cyber-button w-full" 
              disabled={isSubmitting}
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
