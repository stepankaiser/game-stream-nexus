
import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

interface SuccessScreenProps {
  email: string;
  onReset: () => void;
}

const SuccessScreen: React.FC<SuccessScreenProps> = ({ email, onReset }) => {
  return (
    <div className="cyber-card max-w-md w-full mx-auto text-center py-10 px-8 animate-float">
      <div className="rounded-full bg-green-500/20 p-3 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
        <CheckCircle className="h-12 w-12 text-green-500" />
      </div>
      
      <h2 className="text-3xl font-bold mb-4 cyber-heading text-white">
        Submission Successful!
      </h2>
      
      <div className="space-y-4 mb-8">
        <p className="text-muted-foreground">
          Thank you for your submission. We'll prepare your streaming environment within 24 hours.
        </p>
        
        <p className="text-white">
          A confirmation has been sent to:
          <span className="block mt-2 text-cyber-neon-blue font-semibold">{email}</span>
        </p>
        
        <div className="my-6 p-4 bg-cyber-darker/60 rounded-md border border-cyber-purple/20">
          <p className="text-sm text-muted-foreground">
            We'll send you a secure link to test your game build as soon as it's ready.
            For any questions, please contact our support team at <a href="mailto:stepan@remangu.com" className="text-cyber-neon-blue">stepan@remangu.com</a>.
          </p>
        </div>
      </div>
      
      <Button 
        onClick={onReset} 
        className="cyber-button w-full"
      >
        Submit Another Build
      </Button>
    </div>
  );
};

export default SuccessScreen;
