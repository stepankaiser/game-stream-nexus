import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, Expand, Shrink } from 'lucide-react';
import { startStreamSession, getSubmissionDetails, getStreamSessionStatus } from '@/services/supabase';

// Declare the SDK on the window object to satisfy TypeScript
declare global {
  interface Window {
    // Use lowercase 'g' based on SDK file content
    gameliftstreams?: any; 
  }
}

// Define connection states for better UI feedback
type ConnectionStatus = 
    | 'Idle'
    | 'FetchingDetails' 
    | 'PollingDetails'
    | 'DetailsReady'
    | 'InitializingSDK'
    | 'StartingSession'
    | 'Connected'
    | 'Disconnected'
    | 'Error';

// Interface for submission details fetched from DB
interface SubmissionDetails {
    submissionId: string;
    status: string; // e.g., 'UPLOADED', 'PROVISIONING', 'READY', 'ERROR'
    applicationArn?: string;
    streamGroupId?: string; // Need to store this in DB!
    // Add other fields if needed
}

// Interface for stream session info
interface SessionInfo {
  sessionId?: string;
  SignalResponse?: string;
  status?: string;
}

const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds
const POLLING_TIMEOUT_MS = 15 * 60 * 1000; // Timeout after 15 minutes
const SESSION_POLLING_INTERVAL_MS = 3000; // Poll session status more frequently
const SESSION_POLLING_TIMEOUT_MS = 2 * 60 * 1000; // Shorter timeout for session activation

const GameStream = () => {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  
  // State variables
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('Idle');
  const [submissionDetails, setSubmissionDetails] = useState<SubmissionDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameliftSdkInstance, setGameliftSdkInstance] = useState<any>(null);
  const [sdpOffer, setSdpOffer] = useState<string | null>(null); 
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null); 
  const [streamSessionArn, setStreamSessionArn] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>('Checking submission...');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Refs for intervals/timeouts
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionPollIntervalRef = useRef<NodeJS.Timeout | null>(null); // For session status polling
  const sessionPollTimeoutRef = useRef<NodeJS.Timeout | null>(null); // For session status polling timeout

  // Refs for HTML elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Add logging for state changes
  useEffect(() => {
    console.log("[State Change] Connection Status:", connectionStatus);
    console.log("[State Change] Error:", error);
    console.log("[State Change] Status Message:", statusMessage);
  }, [connectionStatus, error, statusMessage]);

  // Add logging for submission details
  useEffect(() => {
    console.log("[State Change] Submission Details:", submissionDetails);
  }, [submissionDetails]);

  // Add logging for session info
  useEffect(() => {
    console.log("[State Change] Session Info:", sessionInfo);
  }, [sessionInfo]);

  // --- Cleanup Effect --- 
  useEffect(() => {
      console.log("GameStream unmounting - clearing intervals/timeouts");
      return () => {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
          if (sessionPollIntervalRef.current) clearInterval(sessionPollIntervalRef.current);
          if (sessionPollTimeoutRef.current) clearTimeout(sessionPollTimeoutRef.current);
      };
  }, []);

  // --- Effect: Poll for Submission Details --- 
  useEffect(() => {
      if (!submissionId || connectionStatus !== 'Idle') {
          console.log("[PollEffect] Skipping: No submissionId or not in Idle state.");
          return;
      }

      console.log(`[PollEffect] Starting polling for submissionId: ${submissionId}`);
      setConnectionStatus('FetchingDetails');
      setStatusMessage('Checking submission status...');

      const pollStartTime = Date.now();

      const poll = async () => {
          if (!submissionId) return; // Guard against race condition on unmount
          console.log(`[PollEffect] Polling DynamoDB for ${submissionId}...`);
          try {
              const details: SubmissionDetails | null = await getSubmissionDetails(submissionId);
              console.log("[PollEffect] Fetched details:", details);

              if (details) {
                  setSubmissionDetails(details); // Update state with latest details

                  // Check for completion or error
                  if (details.status === 'READY' && details.applicationArn && details.streamGroupId) {
                      console.log("[PollEffect] Status is READY and ARN/Group ID found. Stopping poll.");
                      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
                      setConnectionStatus('DetailsReady'); // Move to next state
                      setStatusMessage('Submission ready. Initializing stream...');
                  } else if (details.status?.toLowerCase().startsWith('error')) {
                      console.error(`[PollEffect] Submission entered error state: ${details.status}`);
                      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
                      setError(`Provisioning failed: ${details.status}. Please contact support.`);
                      setStatusMessage(`Provisioning failed: ${details.status}.`);
                      setConnectionStatus('Error');
                  } else {
                      // Continue polling - update status message
                      setStatusMessage(`Provisioning status: ${details.status || 'Unknown'}. Waiting...`);
                  }
              } else {
                  // Item not found yet, continue polling
                  console.log("[PollEffect] Submission details not found yet.");
                  setStatusMessage('Waiting for submission record...');
              }
          } catch (err: any) {
              console.error("[PollEffect] Error during polling:", err);
              // Optionally stop polling on error or just log and continue
              // setError(`Error fetching submission details: ${err.message}`);
              // setConnectionStatus('Error');
              // if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              // if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
          }

          // Check for timeout
          if (Date.now() - pollStartTime > POLLING_TIMEOUT_MS) {
              console.error("[PollEffect] Polling timed out.");
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              setError('Timed out waiting for submission to become ready. Please contact support.');
              setStatusMessage('Timed out waiting for submission status.');
              setConnectionStatus('Error');
          }
      };

      // Initial poll immediately, then set interval
      poll(); 
      pollIntervalRef.current = setInterval(poll, POLLING_INTERVAL_MS);

      // Set overall timeout
      pollTimeoutRef.current = setTimeout(() => {
           console.error("[PollEffect] Polling Timeout Reached (via setTimeout).");
           if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
           
           // Check current status using setter callback form
           setConnectionStatus(currentStatus => {
               if (currentStatus === 'DetailsReady') {
                   setError('Timed out waiting for submission to become ready. Please contact support.');
                   setStatusMessage('Timed out waiting for submission status.');
                   return 'Error'; // Update status to Error
               }
               return currentStatus; // Otherwise, keep the current status
           });

      }, POLLING_TIMEOUT_MS);

      // Cleanup function for this effect
      return () => {
          console.log("[PollEffect] Cleanup: Clearing submission polling interval/timeout.");
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      };

  }, [submissionId, connectionStatus]); // Rerun if submissionId changes or if status resets to Idle

  // --- Effect: Initialize SDK & Generate Offer --- 
  useEffect(() => {
      if (!submissionDetails) return;
      
      // Only proceed with SDK initialization if we have all required details
      if (submissionDetails.status === 'READY' && submissionDetails.applicationArn && submissionDetails.streamGroupId) {
          initializeGameLiftSDK();
      }
  }, [submissionDetails]);

  const initializeGameLiftSDK = () => {
      console.log("[SDK Init Effect] Starting SDK initialization...");
      try {
          const sdkInstance = new window.gameliftstreams.GameLiftStreams({
              videoElement: videoRef.current,
              audioElement: audioRef.current,
              clientConnection: {
                  connectionState: handleConnectionStateChange,
                  serverDisconnect: (reasoncode: string) => {
                      console.warn("Server initiated disconnect:", reasoncode);
                      setError(`Stream disconnected by server: ${reasoncode}`);
                      setStatusMessage(`Stream disconnected by server: ${reasoncode}`);
                      setConnectionStatus('Disconnected');
                  },
                  channelError: (e: any) => {
                      console.error("WebRTC Data Channel Error:", e);
                      setError("Stream encountered a data channel error.");
                      setStatusMessage("Stream encountered a data channel error.");
                      setConnectionStatus('Error');
                  },
                  onTrack: (event: RTCTrackEvent) => {
                    console.log("[SDK Callback] onTrack - Received track:", {
                      kind: event.track.kind,
                      id: event.track.id,
                      label: event.track.label,
                      streamCount: event.streams?.length
                    });
                    if (videoRef.current && event.streams && event.streams[0]) {
                      console.log("[SDK Callback] onTrack - Setting srcObject and attempting play");
                      videoRef.current.srcObject = event.streams[0];
                      videoRef.current.play()
                        .then(() => console.log("[SDK Callback] onTrack - Video play() succeeded"))
                        .catch(err => console.warn("[SDK Callback] onTrack - Video play() failed:", err));
                    } else {
                      console.warn("[SDK Callback] onTrack - Missing video ref or streams:", {
                        hasVideoRef: !!videoRef.current,
                        hasStreams: !!event.streams,
                        streamCount: event.streams?.length
                      });
                    }
                  }
              },
          });
          setGameliftSdkInstance(sdkInstance);
          console.log("[SDK Init Effect] SDK Instance CREATED.");

          // Generate Offer
          (async () => {
              try {
                  console.log("[SDK Init Effect] Generating Offer...");
                  setConnectionStatus('StartingSession');
                  setStatusMessage('Generating session offer...');
                  const offer = await sdkInstance.generateSignalRequest();
                  console.log("[SDK Init Effect] Offer generated.");
                  setSdpOffer(offer);
                  setConnectionStatus('Connected'); 
                  setStatusMessage('Offer generated, requesting session...');
              } catch (genError) {
                  console.error("[SDK Init Effect] Error generating offer:", genError);
                  setError("Failed to generate session offer.");
                  setStatusMessage("Failed to generate session offer.");
                  setConnectionStatus('Error');
              }
          })();

      } catch (initError) {
          console.error("[SDK Init Effect] Error initializing SDK:", initError);
          setError("Failed to initialize streaming SDK.");
          setStatusMessage("Failed to initialize streaming SDK.");
          setConnectionStatus('Error');
      }
  };

  const handleConnectionStateChange = (state: string) => {
    if (state === 'connected') {
        setConnectionStatus('Connected');
        setStatusMessage('Stream connected successfully!');
    } else if (state === 'connecting') {
        setConnectionStatus('StartingSession');
        setStatusMessage('Connection establishing...');
    } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        // Only update if we're not already in an error state
        if (connectionStatus !== 'Error') {
            setConnectionStatus('Disconnected');
            setStatusMessage('Stream disconnected.');
        }
    }
  };

  // --- Effect: Initiate Session & Poll Status --- 
  useEffect(() => {
    // Don't check connectionStatus here since we want to start when we have offer and details
    if (!sdpOffer || !submissionDetails?.applicationArn || !submissionDetails?.streamGroupId) {
        console.log("[Session Effect] Waiting for offer and details:", {
            hasOffer: !!sdpOffer,
            hasArn: !!submissionDetails?.applicationArn,
            hasGroupId: !!submissionDetails?.streamGroupId
        });
        return;
    }

    console.log("[Session Effect] Starting stream session with:", {
        arn: submissionDetails.applicationArn,
        groupId: submissionDetails.streamGroupId
    });
    
    setConnectionStatus('StartingSession'); 
    setStatusMessage('Initiating stream session with backend...');
    
    const initiateSession = async () => {
        try {
            const { streamSessionArn: arn, initialStatus } = await startStreamSession(
                submissionDetails.applicationArn, 
                submissionDetails.streamGroupId, 
                sdpOffer
            );

            console.log(`[Session Effect] Session initiated. ARN: ${arn}, Initial Status: ${initialStatus}`);
            if (!arn) throw new Error("Backend did not return Stream Session ARN.");
            
            // Set ARN first
            setStreamSessionArn(arn);

            if (initialStatus === 'ACTIVE') {
                console.warn("[Session Effect] Session ACTIVE immediately. Getting details...");
                setConnectionStatus('Connected');
                setStatusMessage('Session active, retrieving details...');
                // Add a slight delay before final get
                setTimeout(async () => {
                   try {
                       const immediateResult = await getStreamSessionStatus(arn);
                       console.log("[Session Effect] Immediate get details result:", immediateResult);
                       if (immediateResult?.status === 'ACTIVE' && immediateResult.SignalResponse) {
                           setSessionInfo(immediateResult as SessionInfo);
                           setConnectionStatus('Connected');
                           setStatusMessage('Session details received, processing answer...');
                       } else {
                           throw new Error("Details missing/invalid in immediate get for ACTIVE session.");
                       }
                   } catch (getDetailsError) {
                       console.error("[Session Effect] Error getting details for immediately ACTIVE session:", getDetailsError);
                       setError("Failed to retrieve details for active session.");
                       setConnectionStatus('Error');
                   }
                }, 1000); // 1 sec delay
                
            } else if (initialStatus === 'ACTIVATING' || initialStatus === 'PENDING') {
                console.log(`[Session Effect] Session status is ${initialStatus}. Starting polling...`);
                setConnectionStatus('StartingSession');
                setStatusMessage(`Session pending (${initialStatus}). Polling for ACTIVE status...`);

                const pollStartTime = Date.now();
                
                // Clear any existing intervals/timeouts
                if (sessionPollIntervalRef.current) clearInterval(sessionPollIntervalRef.current);
                if (sessionPollTimeoutRef.current) clearTimeout(sessionPollTimeoutRef.current);

                // Pass ARN directly to pollSession to avoid state timing issues
                const pollSession = async (sessionArn: string) => {
                    console.log(`[Session Poll] Checking status for ${sessionArn}...`);
                    try {
                        const response = await getStreamSessionStatus(sessionArn);
                        // The status is directly in the response, not in StreamSession
                        const status = response?.Status;
                        const signalResponse = response?.SignalResponse;
                        
                        console.log("[Session Poll] Received status:", status);
                        
                        if (status === 'ACTIVE') {
                            console.log("[Session Poll] Session is ACTIVE!");
                            // Clear intervals in a safe way
                            const interval = sessionPollIntervalRef.current;
                            const timeout = sessionPollTimeoutRef.current;
                            if (interval) {
                                sessionPollIntervalRef.current = null;
                                clearInterval(interval);
                            }
                            if (timeout) {
                                sessionPollTimeoutRef.current = null;
                                clearTimeout(timeout);
                            }
                            
                            if (signalResponse) {
                                setSessionInfo({ status, SignalResponse: signalResponse });
                                setConnectionStatus('Connected');
                                setStatusMessage('Session active, processing answer...');
                            } else {
                                console.error("[Session Poll] Session ACTIVE but SignalResponse missing!", response);
                                setError("Session activated but failed to provide connection details.");
                                setConnectionStatus('Error');
                            }
                        } else if (status === 'TERMINATED' || status === 'FAILED') {
                            console.error(`[Session Poll] Session is ${status}. Stopping polling.`);
                            // Clear intervals in a safe way
                            const interval = sessionPollIntervalRef.current;
                            const timeout = sessionPollTimeoutRef.current;
                            if (interval) {
                                sessionPollIntervalRef.current = null;
                                clearInterval(interval);
                            }
                            if (timeout) {
                                sessionPollTimeoutRef.current = null;
                                clearTimeout(timeout);
                            }
                            setError(`Stream session ${status}.`);
                            setConnectionStatus('Error');
                        } else {
                            console.log(`[Session Poll] Status is ${status || 'Unknown'}. Continuing...`);
                            setStatusMessage(`Waiting for session activation (${status || 'Unknown'})...`);
                        }
                    } catch (pollError: any) {
                        console.error("[Session Poll] Error during status check:", pollError);
                    }

                    // Check for timeout
                    if (Date.now() - pollStartTime > SESSION_POLLING_TIMEOUT_MS) {
                        console.error("[Session Poll] Polling timed out.");
                        const interval = sessionPollIntervalRef.current;
                        if (interval) {
                            sessionPollIntervalRef.current = null;
                            clearInterval(interval);
                        }
                        setConnectionStatus(currentStatus => {
                            if (currentStatus === 'DetailsReady') {
                                setError("Timed out waiting for session to become active.");
                                setStatusMessage('Timed out waiting for session activation.');
                                return 'Error';
                            }
                            return currentStatus;
                        });
                    }
                };

                // Start polling with the ARN
                pollSession(arn);
                sessionPollIntervalRef.current = setInterval(() => pollSession(arn), SESSION_POLLING_INTERVAL_MS);
                sessionPollTimeoutRef.current = setTimeout(() => {
                    console.error("[Session Poll] Timeout reached (via setTimeout).");
                    const interval = sessionPollIntervalRef.current;
                    if (interval) {
                        sessionPollIntervalRef.current = null;
                        clearInterval(interval);
                    }
                    setConnectionStatus(currentStatus => {
                        if (currentStatus === 'DetailsReady') {
                            setError("Timed out waiting for session to become active.");
                            setStatusMessage('Timed out waiting for session activation.');
                            return 'Error';
                        }
                        return currentStatus;
                    });
                }, SESSION_POLLING_TIMEOUT_MS);
            } else {
                throw new Error(`Session initiated with unexpected status: ${initialStatus}`);
            }
        } catch (initError: any) {
            console.error("[Session Effect] Error initiating session:", initError);
            setError(`Failed to initiate stream session: ${initError.message}`);
            setStatusMessage(`Failed to initiate stream session.`);
            setConnectionStatus('Error');
        }
    };
    initiateSession();

    // Add cleanup to the effect
    return () => {
        const interval = sessionPollIntervalRef.current;
        const timeout = sessionPollTimeoutRef.current;
        if (interval) {
            sessionPollIntervalRef.current = null;
            clearInterval(interval);
        }
        if (timeout) {
            sessionPollTimeoutRef.current = null;
            clearTimeout(timeout);
        }
    };

  }, [sdpOffer, submissionDetails]); // Only depend on offer and details

  // --- Effect: Process Answer when session info changes
  useEffect(() => {
    if (!sessionInfo?.SignalResponse) return;

    console.log("[Process Answer Effect] Answer received, processing...");
    
    try {
        // Parse the SignalResponse string into an object
        const signalResponse = JSON.parse(sessionInfo.SignalResponse);
        console.log("[Process Answer Effect] Parsed signal response:", signalResponse);
        
        if (!signalResponse.type || !signalResponse.sdp) {
            console.error("[Process Answer Effect] Invalid signal response format:", signalResponse);
            setError("Invalid answer format received from GameLift");
            setConnectionStatus('Error');
            return;
        }

        setStatusMessage("Processing session answer...");
        setConnectionStatus('StartingSession');

        // Process the answer with the SDK
        if (gameliftSdkInstance) {
            console.log("[Process Answer Effect] Processing answer with SDK...");
            gameliftSdkInstance.processSignalResponse(sessionInfo.SignalResponse)
                .then(() => {
                    console.log("[Process Answer Effect] Answer processed successfully");
                    setStatusMessage("Answer processed, waiting for connection...");
                })
                .catch((error) => {
                    console.error("[Process Answer Effect] Error processing answer:", error);
                    setError(`Failed to process answer: ${error.message}`);
                    setConnectionStatus('Error');
                });
        } else {
            console.error("[Process Answer Effect] SDK instance not available!");
            setError("SDK instance not available for processing answer");
            setConnectionStatus('Error');
        }
    } catch (error) {
        console.error("[Process Answer Effect] Error parsing signal response:", error);
        setError(`Failed to parse answer: ${error.message}`);
        setConnectionStatus('Error');
    }
}, [sessionInfo, gameliftSdkInstance]);

  // --- Fullscreen Handling --- 
  const toggleFullscreen = async () => {
    if (!videoContainerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await videoContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.error("Fullscreen request failed:", err);
      setIsFullscreen(!!document.fullscreenElement); // Sync state if request failed
    }
  };

  // Listener to sync state if user exits fullscreen with ESC key
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // --- Render Logic ---

  return (
    <div className="container mx-auto p-4">
      <Card className="bg-cyber-dark/80 backdrop-blur-sm border border-cyber-purple/30">
        <CardHeader>
          <CardTitle className="text-white">Game Stream Session (Manual Test)</CardTitle>
           <CardDescription className="text-muted-foreground">
             Status: <span className={`font-semibold ${connectionStatus === 'Connected' ? 'text-green-400' : 'text-yellow-400'}`}>{connectionStatus}</span>
             {sessionInfo?.sessionId && ` | Session ID: ${sessionInfo.sessionId}`}
             {streamSessionArn && !sessionInfo?.sessionId && ` | Session ARN: ...${streamSessionArn.slice(-6)}`}
             <br/>App: {submissionDetails?.applicationArn}
             <br/>Group: {submissionDetails?.streamGroupId}
           </CardDescription>
           {statusMessage && (
             <p className="text-sm text-cyber-light pt-2">{statusMessage}</p>
           )}
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <div ref={videoContainerRef} className="relative w-full max-w-4xl aspect-video bg-black rounded overflow-hidden mb-4">
            <video ref={videoRef} className="w-full h-full" playsInline muted />
            <audio ref={audioRef} className="hidden" />
            
            {connectionStatus !== 'Connected' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white">
                {connectionStatus !== 'Error' && connectionStatus !== 'Disconnected' && (
                  <Loader2 className="h-12 w-12 animate-spin text-cyber-neon-blue mb-4" />
                )}
                {(connectionStatus === 'Error' || connectionStatus === 'Disconnected') && (
                  <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                )}
                <p className="text-xl font-semibold">{connectionStatus}</p>
                {statusMessage && <p className="text-sm mt-2">{statusMessage}</p>}
                {error && <p className="text-sm text-red-400 mt-2">Error: {error}</p>}
                {(connectionStatus === 'Error' || connectionStatus === 'Disconnected') && (
                  <Button onClick={() => navigate('/')} variant="secondary" className="mt-4">Return Home</Button>
                )}
              </div>
            )}
          </div>

          {/* Fullscreen Button - Show only when connected */} 
          {connectionStatus === 'Connected' && (
            <Button onClick={toggleFullscreen} variant="outline" size="icon" title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}>
              {isFullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GameStream; 