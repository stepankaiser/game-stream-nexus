
import React from 'react';
import { cn } from '@/lib/utils';

interface FooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const Footer: React.FC<FooterProps> = ({ className, ...props }) => {
  return (
    <footer 
      className={cn(
        "w-full py-6 border-t border-cyber-purple/30 bg-cyber-darker/70 backdrop-blur-md mt-20",
        className
      )}
      {...props}
    >
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p className="text-sm text-muted-foreground">
              Powered by <a href="https://aws.amazon.com/gamelift/streams/" target="_blank" rel="noopener noreferrer" className="text-cyber-neon-blue hover:underline">AWS GameLift Streams</a>
            </p>
          </div>
          
          <div className="flex space-x-6">
            <a 
              href="https://aws.amazon.com/terms/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-white transition-colors"
            >
              Terms of Service
            </a>
            <a 
              href="https://aws.amazon.com/privacy/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-white transition-colors"
            >
              Privacy Policy
            </a>
            <a 
              href="https://aws.amazon.com/contact-us/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-white transition-colors"
            >
              Contact Us
            </a>
          </div>
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} PlayTest GDC. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
