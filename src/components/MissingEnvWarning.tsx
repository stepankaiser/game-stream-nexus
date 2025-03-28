
import React from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";

const MissingEnvWarning = () => {
  return (
    <Alert className="bg-yellow-900/20 border-yellow-600 mb-8">
      <Terminal className="h-4 w-4 text-yellow-600" />
      <AlertTitle className="text-yellow-600">Environment Setup Required</AlertTitle>
      <AlertDescription>
        <p className="mt-2">
          Supabase environment variables are missing. To make the form fully functional:
        </p>
        <ol className="list-decimal pl-6 mt-2 space-y-1 text-sm">
          <li>Create a <code className="bg-black/20 px-1 rounded">.env</code> file based on <code className="bg-black/20 px-1 rounded">.env.example</code></li>
          <li>Add your Supabase URL and anon key</li>
          <li>Restart the application</li>
        </ol>
      </AlertDescription>
    </Alert>
  );
};

export default MissingEnvWarning;
