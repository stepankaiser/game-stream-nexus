
import React from 'react';
import Header from '@/components/Header';
import PlaytestForm from '@/components/PlaytestForm';
import Footer from '@/components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col bg-cyber-grid">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-12">
        <section className="mb-16 text-center max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6 cyber-heading leading-tight">
            <span className="text-white">Test Your Games On </span>
            <span className="text-cyber-neon-purple">Cloud Streaming</span>
          </h1>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 mt-12">
            <div className="cyber-card h-full flex flex-col">
              <div className="rounded-full bg-cyber-neon-purple/20 w-12 h-12 flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-cyber-neon-purple">1</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">Submit Your Game</h3>
              <p className="text-muted-foreground flex-1">
                Upload your game build through our secure platform. We accept various formats including .zip, .exe, and .dmg files.
              </p>
            </div>
            
            <div className="cyber-card h-full flex flex-col">
              <div className="rounded-full bg-cyber-neon-blue/20 w-12 h-12 flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-cyber-neon-blue">2</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">24-Hour Setup</h3>
              <p className="text-muted-foreground flex-1">
                Our team will prepare the cloud streaming environment using Amazon GameLift Streams technology within 24 hours.
              </p>
            </div>
            
            <div className="cyber-card h-full flex flex-col">
              <div className="rounded-full bg-cyber-neon-purple/20 w-12 h-12 flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-cyber-neon-purple">3</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">Receive Link</h3>
              <p className="text-muted-foreground flex-1">
                We'll send you a secure link to access your game in the cloud. No downloads or installations required.
              </p>
            </div>
            
            <div className="cyber-card h-full flex flex-col">
              <div className="rounded-full bg-cyber-neon-blue/20 w-12 h-12 flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-cyber-neon-blue">4</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">Play & Evaluate</h3>
              <p className="text-muted-foreground flex-1">
                Experience your game through cloud streaming and evaluate if this technology fits your needs and use cases.
              </p>
            </div>
          </div>
          
          <div className="cyber-card mt-10 p-8 border-2 border-cyber-neon-purple/30">
            <h2 className="text-2xl font-bold mb-4 cyber-heading">Powered by Amazon GameLift Streams</h2>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <img src="/lovable-uploads/f8a6f77c-a25c-4c31-9106-1f3591ae2d4d.png" alt="AWS Logo" className="h-16 w-auto" />
              <div className="text-left">
                <p className="text-muted-foreground mb-3">
                  Amazon GameLift Streams provides low-latency cloud game streaming, enabling players to access games from any device without downloads.
                </p>
                <a 
                  href="https://aws.amazon.com/gamelift/streams/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-cyber-neon-blue hover:underline inline-flex items-center"
                >
                  Learn more about Amazon GameLift Streams
                </a>
              </div>
            </div>
          </div>
        </section>
        
        <section className="my-16">
          <h2 className="text-2xl font-bold mb-8 text-center cyber-heading">Ready to Test Your Game?</h2>
          <PlaytestForm />
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
