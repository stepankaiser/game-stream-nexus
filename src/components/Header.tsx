
import React from 'react';
import { cn } from '@/lib/utils';

interface HeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

const Header: React.FC<HeaderProps> = ({ className, ...props }) => {
  return (
    <header 
      className={cn(
        "w-full py-6 border-b border-cyber-purple/30 bg-cyber-darker/70 backdrop-blur-md sticky top-0 z-50",
        className
      )}
      {...props}
    >
      <div className="container mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img 
            src="/lovable-uploads/f8a6f77c-a25c-4c31-9106-1f3591ae2d4d.png" 
            alt="Remāngu Logo" 
            className="h-10 w-auto animate-float" 
          />
          <div className="ml-3">
            <h1 className="text-2xl font-bold text-white cyber-heading">
              <span className="text-cyber-neon-blue">Remāngu</span>
              <span className="text-cyber-neon-purple"> Playtest</span>
              <span className="text-white"> Platform</span>
            </h1>
            <p className="text-xs text-muted-foreground">Powered by Amazon GameLift Streams</p>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          <a 
            href="https://aws.amazon.com/gamelift/streams/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-white/80 hover:text-cyber-neon-blue transition-colors duration-300"
          >
            Learn More
          </a>
          <a 
            href="#playtestform" 
            className="cyber-button"
          >
            Start Testing
          </a>
        </nav>
        <a 
          href="#playtestform" 
          className="md:hidden cyber-button"
        >
          Test
        </a>
      </div>
    </header>
  );
};

export default Header;
