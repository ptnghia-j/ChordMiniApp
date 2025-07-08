/**
 * Music.ai Service
 *
 * This service provides integration with the Music.ai API for lyrics transcription,
 * chord generation, and synchronization between lyrics and chords.
 */

import { CustomMusicAiClient } from "./customMusicAiClient";
import { apiKeyStorage } from "./apiKeyStorageService";

// Define types for the Music.ai SDK responses
interface ChordData {
  time: number;
  chord: string;
}

interface LyricLine {
  startTime: number;
  endTime: number;
  text: string;
}

interface LyricsData {
  lines: LyricLine[];
  error?: string; // Optional error message when lyrics transcription fails
}

interface SynchronizedLyrics {
  lines: Array<{
    startTime: number;
    endTime: number;
    text: string;
    chords: Array<{
      time: number;
      chord: string;
      position: number; // Character position in the line
    }>;
  }>;
  error?: string; // Optional error message when lyrics synchronization fails
}

interface MusicAiJobResult {
  lines?: Array<{
    text: string;
    startTime?: number;
    endTime?: number;
    start?: number;
    end?: number;
  }>;
  chords?: Array<{
    time: number;
    name: string;
  }>;
  words?: Array<{
    text: string;
    startTime?: number;
    endTime?: number;
    start?: number;
    end?: number;
  }>;
  lyrics?: string;
  transcript?: string;
  wordTimestamps?: WordTimestamp[];
  [key: string]: unknown;
}

// Additional interfaces for lyrics processing
interface LyricsLineData {
  text: string;
  start?: number;
  startTime?: number;
  end?: number;
  endTime?: number;
}

interface WordTimestamp {
  text: string;
  start?: number;
  startTime?: number;
  end?: number;
  endTime?: number;
}

interface ChordResultData {
  time: number;
  name?: string;
  chord?: string;
}

// Define interface for Music.ai SDK
interface MusicAiSDK {
  workflows: {
    list: () => Promise<Array<{
      slug: string;
      name: string;
      description?: string;
    }>>;
  };
  jobs: {
    create: (params: { workflow: string; input: Record<string, unknown> }) => Promise<{
      id: string;
      status: string;
    }>;
    get: (id: string) => Promise<{
      id: string;
      status: string;
      result?: MusicAiJobResult;
    }>;
  };
}

class MusicAiService {
  private musicAi: MusicAiSDK | null = null;
  private customClient: CustomMusicAiClient | null = null;
  private initialized: boolean = false;

  constructor() {
    // Initialize the SDK lazily to avoid issues during SSR
    this.initialized = false;
  }

  /**
   * Initialize the Music.ai SDK with the API key
   * This is done lazily to avoid issues during SSR
   * Prioritizes user-provided API key over environment variable
   */
  private initialize = async (): Promise<void> => {
    if (!this.initialized) {
      try {
        let apiKey: string | null = null;

        // First try to get user-provided API key (only in browser environment)
        try {
          apiKey = await apiKeyStorage.getApiKey('musicAi');
        } catch {
          console.log('Could not access user API key (likely server-side), falling back to environment variable');
        }

        // Fallback to environment variable if no user key is provided
        if (!apiKey) {
          apiKey = process.env.MUSIC_AI_API_KEY || null;
        }

        if (!apiKey) {
          throw new Error('Music.ai API key is required. Please provide your API key in settings or add MUSIC_AI_API_KEY to environment variables.');
        }

        // Initialize the SDK with the API key
        const sdkConfig = {
          apiKey: apiKey,
          // Add any other configuration options here
          timeout: 120000, // 120 seconds timeout (2 minutes)
          retries: 3,      // Retry failed requests 3 times
          debug: false     // Disable debug mode for production
        };

        // Initialize both the SDK and our custom client using dynamic import with fallback
        try {
          const MusicAiModule = await import("@music.ai/sdk");
          const MusicAi = MusicAiModule.default || MusicAiModule;
          this.musicAi = new MusicAi(sdkConfig) as unknown as MusicAiSDK;
          this.customClient = new CustomMusicAiClient(sdkConfig);

          console.log('Music.ai SDK and custom client initialized successfully');
          this.initialized = true;
        } catch (importError) {
          console.error('Failed to import Music.ai SDK, falling back to custom client only:', importError);

          // Fallback: Use only the custom client if SDK import fails
          try {
            this.customClient = new CustomMusicAiClient(sdkConfig);
            // Create a mock SDK object that delegates to custom client
            this.musicAi = {
              transcribe: async (audioUrl: string) => {
                console.log('Using fallback transcription via custom client');
                // Use the same logic as the main transcribeLyrics method but simplified
                const workflowSlug = 'lyric-transcription-and-alignment';
                const params: Record<string, string | number | boolean | object> = {
                  audio: audioUrl,
                  includeLyrics: true,
                  transcribeLyrics: true,
                  language: "en",
                  model: "default",
                  quality: "high"
                };

                const jobId = await this.customClient!.addJob(workflowSlug, params);
                const job = await this.customClient!.waitForJobCompletion(jobId, 300000);

                if (job.status === "SUCCEEDED" && job.result) {
                  return job.result;
                } else {
                  throw new Error(`Transcription job failed: ${job.status}`);
                }
              }
            } as unknown as MusicAiSDK;

            console.log('Fallback to custom client successful');
            this.initialized = true;
          } catch (fallbackError) {
            console.error('Both SDK and custom client initialization failed:', fallbackError);
            throw new Error(`Music.ai service unavailable: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('Failed to initialize Music.ai SDK:', error);
        throw error;
      }
    }
  }

  /**
   * Transcribe lyrics from an audio file
   * @param audioUrl URL of the audio file to transcribe
   * @param workflowSlug Optional workflow slug to use for transcription
   * @param customApiKey Optional custom API key to use instead of stored key
   * @returns Transcribed lyrics data or empty lyrics with error message
   */
  transcribeLyrics = async (audioUrl: string, workflowSlug?: string, customApiKey?: string): Promise<LyricsData> => {
    // We only use Music.ai API for lyrics transcription, never for chord or beat detection
    try {
      // Initialize with custom API key if provided, otherwise use stored key
      if (customApiKey) {
        // Create a temporary custom client with the provided API key
        const tempClient = new CustomMusicAiClient({
          apiKey: customApiKey,
          timeout: 300000, // 5 minutes timeout
          retries: 3
        });
        this.customClient = tempClient;
      } else {
        // Initialize with user-provided or environment API key
        await this.initialize();
      }
      console.log(`Transcribing lyrics from: ${audioUrl}`);

      // Handle local file paths vs URLs
      let inputUrl = audioUrl;

      // Check if the URL is a Firebase Storage URL or other HTTP URL
      if (audioUrl.startsWith('https://') || audioUrl.startsWith('http://')) {
        console.log(`✅ Using external URL directly: ${audioUrl}`);
        // URL is already ready for Music.ai API - no upload needed
      } else if (audioUrl.startsWith('/') || audioUrl.startsWith('file://')) {
        console.log('Local file path detected. Music.ai API requires file upload.');

        try {
          // Get the full path to the file
          let filePath = audioUrl;

          if (audioUrl.startsWith('file://')) {
            filePath = audioUrl.replace('file://', '');
          } else if (audioUrl.startsWith('/audio/')) {
            // For paths like /audio/sample.mp3, look in the public directory
            filePath = `${process.cwd()}/public${audioUrl}`;
          } else if (audioUrl.startsWith('/')) {
            // For absolute paths starting with /, assume they're relative to public
            filePath = `${process.cwd()}/public${audioUrl}`;
          } else {
            filePath = `${process.cwd()}${audioUrl}`;
          }

          console.log(`Using file path: ${filePath}`);

          // Check if file exists before attempting upload
          try {
            const fs = await import('fs/promises');
            await fs.access(filePath);
            console.log(`✅ File exists: ${filePath}`);
          } catch {
            console.error(`❌ File not found: ${filePath}`);
            throw new Error(`Audio file not found at path: ${filePath}. Please ensure the audio file exists.`);
          }

          // Upload the file to Music.ai API using our custom client
          if (this.customClient) {
            try {
              // Use the new uploadLocalFile method
              inputUrl = await this.customClient.uploadLocalFile(filePath, 'audio/mpeg');
            } catch (uploadError) {
              console.error('Error uploading file to Music.ai API:', uploadError);

              // Try to read the file directly and upload it
              try {
                const fs = await import('fs/promises');
                const fileData = await fs.readFile(filePath);

                inputUrl = await this.customClient.uploadFile(fileData, 'audio/mpeg');
              } catch (retryError) {
                console.error('Error in retry upload:', retryError);
                throw retryError; // Re-throw to be caught by the outer catch
              }
            }
          } else {
            console.error('Cannot upload file: custom client is not initialized');
            return this.createEmptyLyricsWithError('Unable to upload audio file - client not initialized');
          }
        } catch (error) {
          console.error('Error reading or uploading file:', error);
          return this.createEmptyLyricsWithError('Error accessing audio file. Please try again later.');
        }
      }

      // Log the input URL for debugging
      console.log(`Using input URL for transcription: ${inputUrl}`);

      // Use our custom client instead of the SDK
      console.log("Using custom Music.ai client for lyrics transcription...");

      if (!this.customClient) {
        throw new Error("Custom Music.ai client is not initialized");
      }

      // List available workflows to find the correct one for lyrics transcription
      console.log("Listing available workflows to find lyrics transcription workflow...");
      const workflows = await this.customClient.listWorkflows();

      // Find a workflow for lyrics transcription
      console.log('Available workflows:');
      workflows.forEach((workflow: { name: string; slug: string; description?: string }) => {
        console.log(`- ${workflow.name} (slug: ${workflow.slug}, description: ${workflow.description || 'none'})`);
      });

      // According to the API documentation, we need to use the workflow slug, not the name
      let lyricsWorkflow;

      // If a specific workflow slug is provided, try to use it
      if (workflowSlug) {
        console.log(`Looking for provided workflow slug: ${workflowSlug}`);
        lyricsWorkflow = workflows.find((w: { name: string; slug: string; description?: string }) => w.slug === workflowSlug);

        if (lyricsWorkflow) {
          console.log(`Found provided workflow by slug: ${lyricsWorkflow.name} (${lyricsWorkflow.slug})`);
        } else {
          console.warn(`Provided workflow slug ${workflowSlug} not found, falling back to default workflows`);
        }
      }

      // If no workflow was provided or the provided workflow wasn't found, try the default workflows
      if (!lyricsWorkflow) {
        // We only use Music.ai API for lyrics transcription, never for chord or beat detection
        console.log("Looking for lyrics-only workflows...");

        // First try the "Lyric Transcription and Alignment" workflow by exact slug
        lyricsWorkflow = workflows.find((w: { name: string; slug: string; description?: string }) => w.slug === 'untitled-workflow-1b8940f');

        if (lyricsWorkflow) {
          console.log(`Found "Lyric Transcription and Alignment" workflow by exact slug: ${lyricsWorkflow.slug}`);
        } else {
          // Try another known lyrics workflow
          lyricsWorkflow = workflows.find((w: { name: string; slug: string; description?: string }) => w.slug === 'untitled-workflow-1b8813b');

          if (lyricsWorkflow) {
            console.log(`Found alternative lyrics workflow by exact slug: ${lyricsWorkflow.slug}`);
          } else {
            // If not found by exact slug, look for workflows related to lyrics
            const lyricsWorkflows = workflows.filter((w: { name: string; slug: string; description?: string }) => this.isLyricsWorkflow(w));

            if (lyricsWorkflows.length > 0) {
              lyricsWorkflow = lyricsWorkflows[0];
              console.log(`Found lyrics-only workflow: ${lyricsWorkflow.name} (${lyricsWorkflow.slug})`);
            } else {
              console.warn("No lyrics-only workflows found");
            }
          }
        }
      }

      // Use the found workflow or the first available one
      let selectedWorkflowSlug = "";
      if (lyricsWorkflow) {
        selectedWorkflowSlug = lyricsWorkflow.slug;
      } else if (workflows && workflows.length > 0) {
        // If no lyrics-specific workflow is found, use the first available workflow
        selectedWorkflowSlug = workflows[0].slug;
        console.log(`No lyrics-specific workflow found. Using first available workflow: ${workflows[0].name} (${selectedWorkflowSlug})`);
      } else {
        // If no workflows are available, use a fallback message
        console.error("No workflows available. Cannot proceed with lyrics transcription.");
        throw new Error("No workflows available for lyrics transcription");
      }

      // Create a job for lyrics transcription
      console.log(`Using workflow: ${selectedWorkflowSlug} for lyrics transcription`);
      // Prepare parameters based on the workflow
      const params: Record<string, string | number | boolean | object> = {
        input: inputUrl
      };

      // Add workflow-specific parameters
      const workflowName = lyricsWorkflow.name.toLowerCase();

      // For "Lyric Transcription and Alignment" workflow, use specific parameters
      if (workflowName === 'lyric transcription and alignment') {
        // Format 1: Standard input parameter
        params.input = inputUrl;

        // Format 2: Alternative input parameter names
        params.inputUrl = inputUrl;
        params.audioUrl = inputUrl;
        params.url = inputUrl;
        params.source = inputUrl;

        // Add configuration parameters that might be needed
        params.format = "mp3";
        params.sampleRate = 44100;

        // According to the API documentation, the params field should contain the inputUrl
        // Update the input parameter to match the API documentation
        params.inputUrl = inputUrl;

        // Add specific parameters for lyrics transcription based on the API documentation
        params.includeLyrics = true;
        params.transcribeLyrics = true;
        params.language = "en";
        params.model = "default";
        params.quality = "high";

        // Add parameters that might be required by the workflow
        params.task = "lyrics_transcription";
        params.type = "lyrics";
        params.outputFormat = "json";

        // Add specific parameters for the Lyric Transcription workflow
        params.transcribe = true;
        params.lyrics = true;

        // Add output format parameters
        params.output = {
          format: "json",
          includeTimestamps: true,
          includeLyrics: true
        };

        console.log("Using parameters for Lyric Transcription and Alignment workflow (lyrics only)");
      }
      // For other workflows, add generic parameters
      else {
        params.input = inputUrl;
        params.language = "en";
      }

      // Log the parameters
      console.log(`Parameters for workflow ${selectedWorkflowSlug}:`, params);

      const jobId = await this.customClient.addJob(selectedWorkflowSlug, params);

      console.log(`Created lyrics transcription job with ID: ${jobId}`);
      console.log(`Job type: ${typeof jobId}, value: ${JSON.stringify(jobId)}`);

      // Wait for job completion with a longer timeout
      const job = await this.customClient.waitForJobCompletion(jobId, 300000); // 5 minutes timeout

      if (job.status === "SUCCEEDED") {
        console.log(`Lyrics transcription job succeeded`);
        console.log(`Job result type:`, typeof job.result);
        console.log(`Job result is array:`, Array.isArray(job.result));
        console.log(`Job result keys:`, Object.keys(job.result || {}));
        console.log(`Job result:`, job.result);

        // Process and return the results
        if (!job.result) {
          throw new Error('Job completed but no result data available');
        }
        const lyricsData: LyricsData = await this.processLyricsResult(job.result as MusicAiJobResult);

        // Check if we have any lyrics
        if (lyricsData.lines.length === 0) {
          console.warn('No lyrics were detected in the audio');
          return this.createEmptyLyricsWithError(lyricsData.error || 'No lyrics detected');
        }

        console.log(`Successfully processed lyrics with ${lyricsData.lines.length} lines`);
        return lyricsData;
      } else {
        console.error(`Lyrics transcription job failed with status: ${job.status}`);
        console.error(`Job error details:`, job.error || 'No error details available');
        return this.createEmptyLyricsWithError(`Transcription failed: ${job.status}`);
      }
    } catch (error) {
      console.error("Error in lyrics transcription:", error);

      // Provide more context in the error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Lyrics transcription error: ${errorMessage}`);

      // Fallback mechanism is disabled due to syntax issues
      console.error('Lyrics transcription failed and fallback is disabled');

      // Return empty lyrics with error message
      return this.createEmptyLyricsWithError('Error transcribing lyrics: ' + errorMessage);
    }
  }

  /**
   * Generate chord progressions from an audio file
   * @param audioUrl URL of the audio file to analyze
   * @returns Array of chord data with timestamps
   */
  generateChords = async (audioUrl: string): Promise<ChordData[]> => {
    try {
      // Initialize with user-provided or environment API key
      await this.initialize();
      console.log(`Generating chords from: ${audioUrl}`);

      // Handle local file paths
      let inputUrl = audioUrl;

      // Check if the URL is a local path (starts with / or file://)
      if (audioUrl.startsWith('/') || audioUrl.startsWith('file://')) {
        console.log('Local file path detected. Music.ai API requires file upload.');

        try {
          // Get the full path to the file
          let filePath = audioUrl;

          if (audioUrl.startsWith('file://')) {
            filePath = audioUrl.replace('file://', '');
          } else if (audioUrl.startsWith('/audio/')) {
            // For paths like /audio/sample.mp3, look in the public directory
            filePath = `${process.cwd()}/public${audioUrl}`;
          } else if (audioUrl.startsWith('/')) {
            // For absolute paths starting with /, assume they're relative to public
            filePath = `${process.cwd()}/public${audioUrl}`;
          } else {
            filePath = `${process.cwd()}${audioUrl}`;
          }

          console.log(`Using file path: ${filePath}`);

          // Check if file exists before attempting upload
          try {
            const fs = await import('fs/promises');
            await fs.access(filePath);
            console.log(`✅ File exists: ${filePath}`);
          } catch {
            console.error(`❌ File not found: ${filePath}`);
            throw new Error(`Audio file not found at path: ${filePath}. Please ensure the audio file exists.`);
          }

          // Upload the file to Music.ai API using our custom client
          if (this.customClient) {
            try {
              // Use the new uploadLocalFile method
              inputUrl = await this.customClient.uploadLocalFile(filePath, 'audio/mpeg');
            } catch (uploadError) {
              console.error('Error uploading file to Music.ai API:', uploadError);

              // Try to read the file directly and upload it
              try {
                const fs = await import('fs/promises');
                const fileData = await fs.readFile(filePath);
                console.log(`Read file directly: ${filePath} (${fileData.length} bytes)`);

                inputUrl = await this.customClient.uploadFile(fileData, 'audio/mpeg');
                console.log(`File uploaded successfully after retry. Download URL: ${inputUrl}`);
              } catch (retryError) {
                console.error('Error in retry upload:', retryError);
                throw retryError; // Re-throw to be caught by the outer catch
              }
            }
          } else {
            console.error('Cannot upload file: custom client is not initialized');
            return [];
          }
        } catch (error) {
          console.error('Error reading or uploading file:', error);
          return [];
        }
      }

      // Log the input URL for debugging
      console.log(`Using input URL for chord generation: ${inputUrl}`);

      // Use our custom client instead of the SDK
      console.log("Using custom Music.ai client for chord generation...");

      if (!this.customClient) {
        throw new Error("Custom Music.ai client is not initialized");
      }

      // List available workflows to find the correct one for chord recognition
      console.log("Listing available workflows to find chord recognition workflow...");
      const workflows = await this.customClient.listWorkflows();

      // Find a workflow for chord recognition
      let chordWorkflow = null;
      if (workflows && workflows.length > 0) {
        console.log(`Found ${workflows.length} workflows`);

        // Look for workflows related to chords
        const chordWorkflows = workflows.filter((w: { name: string; slug: string; description?: string }) => this.isChordWorkflow(w));

        if (chordWorkflows.length > 0) {
          chordWorkflow = chordWorkflows[0];
          console.log(`Found chord workflow: ${chordWorkflow.name} (${chordWorkflow.slug})`);
        } else {
          console.warn("No chord-related workflows found");
        }
      } else {
        console.warn("No workflows found or unable to list workflows");
      }

      // Use the found workflow or the first available one
      let workflowSlug = "";
      if (chordWorkflow) {
        workflowSlug = chordWorkflow.slug;
      } else if (workflows && workflows.length > 0) {
        // If no chord-specific workflow is found, use the first available workflow
        workflowSlug = workflows[0].slug;
        console.log(`No chord-specific workflow found. Using first available workflow: ${workflows[0].name} (${workflowSlug})`);
      } else {
        // If no workflows are available, use a fallback message
        console.error("No workflows available. Cannot proceed with chord generation.");
        throw new Error("No workflows available for chord generation");
      }

      // Create a job for chord generation
      console.log(`Using workflow: ${workflowSlug} for chord generation`);
      // Prepare parameters based on the workflow
      const params: Record<string, string | number | boolean | object> = {
        input: inputUrl
      };

      // Log the parameters
      console.log(`Parameters for workflow ${workflowSlug}:`, params);

      const jobId = await this.customClient.addJob(workflowSlug, params);

      console.log(`Created chord generation job with ID: ${jobId}`);
      console.log(`Job type: ${typeof jobId}, value: ${JSON.stringify(jobId)}`);

      // Wait for job completion with a longer timeout
      const job = await this.customClient.waitForJobCompletion(jobId, 300000); // 5 minutes timeout

      if (job.status === "SUCCEEDED") {
        console.log(`Chord generation job succeeded`);
        console.log(`Job result:`, job.result);

        // Process and return the results
        if (!job.result) {
          throw new Error('Job completed but no result data available');
        }
        const chordData: ChordData[] = this.processChordResult(job.result as MusicAiJobResult);

        // Check if we have any chords
        if (chordData.length === 0) {
          console.warn('No chords were detected in the audio');
        }

        return chordData;
      } else {
        console.error(`Chord generation job failed with status: ${job.status}`);
        console.error(`Job error details:`, job.error || 'No error details available');
        return [];
      }
    } catch (error) {
      console.error("Error in chord generation:", error);

      // Provide more context in the error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Chord generation error: ${errorMessage}`);

      // Return empty array as fallback
      return [];
    }
  }

  /**
   * Synchronize lyrics with chord progressions
   * @param lyrics Transcribed lyrics data
   * @param chords Generated chord data
   * @returns Synchronized data with lyrics and chords
   */
  synchronizeLyricsWithChords = async (
    lyrics: LyricsData,
    chords: ChordData[]
  ): Promise<SynchronizedLyrics> => {
    try {
      // Check if we have lyrics to synchronize
      if (!lyrics.lines || lyrics.lines.length === 0) {
        console.warn('No lyrics lines to synchronize');
        return {
          lines: [],
          error: lyrics.error || 'No lyrics available'
        };
      }

      console.log(`Synchronizing ${lyrics.lines.length} lyrics lines with ${chords.length} chords`);

      // If we have no chords, create some dummy chords for visualization
      if (!chords || chords.length === 0) {
        console.warn('No chords available for synchronization, creating dummy chords');

        // Create dummy chords for each line
        const dummyChords: ChordData[] = [];
        lyrics.lines.forEach(line => {
          // Add a chord at the start of each line
          dummyChords.push({
            time: line.startTime,
            chord: 'C'  // Default chord
          });

          // Add another chord in the middle if the line is long enough
          if (line.endTime - line.startTime > 5) {
            dummyChords.push({
              time: line.startTime + (line.endTime - line.startTime) / 2,
              chord: 'G'  // Another default chord
            });
          }
        });

        // Use the dummy chords for synchronization
        chords = dummyChords;
      }

      // Create a new data structure with synchronized lyrics and chords
      const synchronizedLines = lyrics.lines.map(line => {
        // Find chords that fall within this line's time range
        const lineChords = chords.filter(
          chord => chord.time >= line.startTime && chord.time <= line.endTime
        );

        // Calculate the position of each chord within the line text
        const chordsWithPositions = lineChords.map(chord => {
          // Calculate relative position of the chord within the line
          const relativeTime = (chord.time - line.startTime) / (line.endTime - line.startTime);
          // Map to a character position in the text
          const position = Math.floor(relativeTime * line.text.length);

          return {
            time: chord.time,
            chord: chord.chord,
            position: Math.min(position, line.text.length - 1) // Ensure position is within text bounds
          };
        });

        return {
          startTime: line.startTime,
          endTime: line.endTime,
          text: line.text,
          chords: chordsWithPositions
        };
      });

      return { lines: synchronizedLines };
    } catch (error) {
      console.error("Error synchronizing lyrics with chords:", error);
      return {
        lines: [],
        error: 'Error synchronizing lyrics with chords'
      };
    }
  }

  /**
   * Process the raw lyrics result from Music.ai API
   * @param result Raw API result
   * @returns Structured lyrics data
   */
  processLyricsResult = async (result: MusicAiJobResult | string): Promise<LyricsData> => {
    try {
      console.log("Processing lyrics result - Type:", typeof result);
      console.log("Is Array?", Array.isArray(result));
      console.log("Result keys:", Object.keys(result || {}));

      // Special case: If result is a string URL, treat it as the lyrics URL directly
      if (typeof result === 'string' && result.startsWith('http')) {
        console.log("Result is a direct URL string:", result);
        result = { lyrics: result };
      }

      console.log("Processing lyrics result:", JSON.stringify(result, null, 2));

      const lines: LyricLine[] = [];

      // Check if the result is empty or doesn't have the expected structure
      if (!result || Object.keys(result).length === 0) {
        console.warn("Empty result from Music.ai API. The workflow may not be configured for lyrics transcription.");
        return {
          lines: [],
          error: "No lyrics detected in the audio"
        };
      }

      // Check if the result itself is a URL string (from Firestore cache)
      let urlToFetch = '';
      if (typeof result === 'string' && result.startsWith('http')) {
        console.log("Result is a direct URL string:", result);
        urlToFetch = result;
      }
      // Check if the result contains a URL to the lyrics data
      else if (typeof result === 'object' && result !== null && 'lyrics' in result &&
               typeof result.lyrics === 'string' && result.lyrics.startsWith('http')) {
        console.log("Lyrics data is available at URL:", result.lyrics);
        urlToFetch = result.lyrics;
      }

      // If we have a URL to fetch, process it
      if (urlToFetch) {
        try {
          // Fetch the lyrics data from the URL
          console.log("Fetching lyrics data from URL:", urlToFetch);
          const response = await fetch(urlToFetch);

          if (!response.ok) {
            throw new Error(`Failed to fetch lyrics data: ${response.status} ${response.statusText}`);
          }

          const lyricsData = await response.json();
          console.log("Fetched lyrics data type:", typeof lyricsData);
          console.log("Fetched lyrics data is array:", Array.isArray(lyricsData));
          console.log("Fetched lyrics data keys:", Object.keys(lyricsData || {}));
          console.log("Fetched lyrics data:", JSON.stringify(lyricsData, null, 2));

          // If the fetched data is an array, process it directly
          if (Array.isArray(lyricsData)) {
            console.log("Processing array of lyrics lines directly");
            lyricsData.forEach((item: { text: string; start?: number; startTime?: number; end?: number; endTime?: number }) => {
              if (item.text && (item.start !== undefined || item.startTime !== undefined) &&
                  (item.end !== undefined || item.endTime !== undefined)) {
                lines.push({
                  startTime: parseFloat(String(item.start || item.startTime || 0)),
                  endTime: parseFloat(String(item.end || item.endTime || 0)),
                  text: item.text.trim()
                });
              }
            });
          }
          // Process the fetched lyrics data as an object
          else if (lyricsData) {
            // Format 1: Direct lines array
            if (Array.isArray(lyricsData.lines)) {
              lyricsData.lines.forEach((line: LyricsLineData) => {
                if (line.text && (line.startTime !== undefined || line.start !== undefined) &&
                    (line.endTime !== undefined || line.end !== undefined)) {
                  lines.push({
                    startTime: parseFloat(String(line.startTime || line.start || 0)),
                    endTime: parseFloat(String(line.endTime || line.end || 0)),
                    text: line.text.trim()
                  });
                }
              });
            }
            // Format 2: Transcript with word timestamps
            else if (lyricsData.transcript && lyricsData.wordTimestamps) {
              // Create lines from the transcript
              const words = lyricsData.wordTimestamps;

              // Group words into lines (assuming words are in order)
              let currentLine = "";
              let lineStartTime = 0;
              let lineEndTime = 0;

              words.forEach((word: WordTimestamp, index: number) => {
                if (word.text && (word.startTime !== undefined || word.start !== undefined) &&
                    (word.endTime !== undefined || word.end !== undefined)) {
                  const wordStartTime = parseFloat(String(word.startTime || word.start || 0));
                  const wordEndTime = parseFloat(String(word.endTime || word.end || 0));

                  // If this is the first word or if we should start a new line
                  if (currentLine === "" || word.text.startsWith("\n") || currentLine.length > 80) {
                    // If we have a line, add it
                    if (currentLine !== "") {
                      lines.push({
                        startTime: lineStartTime,
                        endTime: lineEndTime,
                        text: currentLine.trim()
                      });
                    }

                    // Start a new line
                    currentLine = word.text.replace(/^\n+/, ""); // Remove leading newlines
                    lineStartTime = wordStartTime;
                    lineEndTime = wordEndTime;
                  } else {
                    // Add to current line
                    currentLine += " " + word.text;
                    lineEndTime = wordEndTime;
                  }
                }

                // If this is the last word, add the final line
                if (index === words.length - 1 && currentLine !== "") {
                  lines.push({
                    startTime: lineStartTime,
                    endTime: lineEndTime,
                    text: currentLine.trim()
                  });
                }
              });
            }
          }
        } catch (fetchError) {
          console.error("Error fetching lyrics data from URL:", fetchError);
          return {
            lines: [],
            error: "Error fetching lyrics data: " + (fetchError instanceof Error ? fetchError.message : String(fetchError))
          };
        }
      } else {
        // Try to extract lyrics directly from the result object
        // Format 1: Direct lines array
        if (typeof result === 'object' && result !== null && 'lines' in result && Array.isArray(result.lines)) {
          result.lines.forEach((line: LyricsLineData) => {
            if (line.text && (line.startTime !== undefined || line.start !== undefined) &&
                (line.endTime !== undefined || line.end !== undefined)) {
              lines.push({
                startTime: parseFloat(String(line.startTime || line.start || 0)),
                endTime: parseFloat(String(line.endTime || line.end || 0)),
                text: line.text.trim()
              });
            }
          });
        }
        // Format 2: Transcript with word timestamps
        else if (typeof result === 'object' && result !== null && 'transcript' in result && 'wordTimestamps' in result && result.transcript && result.wordTimestamps) {
          // Create lines from the transcript
          const words = result.wordTimestamps;

          // Group words into lines (assuming words are in order)
          let currentLine = "";
          let lineStartTime = 0;
          let lineEndTime = 0;

          words.forEach((word: WordTimestamp, index: number) => {
            if (word.text && (word.startTime !== undefined || word.start !== undefined) &&
                (word.endTime !== undefined || word.end !== undefined)) {
              const wordStartTime = parseFloat(String(word.startTime || word.start || 0));
              const wordEndTime = parseFloat(String(word.endTime || word.end || 0));

              // If this is the first word or if we should start a new line
              if (currentLine === "" || word.text.startsWith("\n") || currentLine.length > 80) {
                // If we have a line, add it
                if (currentLine !== "") {
                  lines.push({
                    startTime: lineStartTime,
                    endTime: lineEndTime,
                    text: currentLine.trim()
                  });
                }

                // Start a new line
                currentLine = word.text.replace(/^\n+/, ""); // Remove leading newlines
                lineStartTime = wordStartTime;
                lineEndTime = wordEndTime;
              } else {
                // Add to current line
                currentLine += " " + word.text;
                lineEndTime = wordEndTime;
              }
            }

            // If this is the last word, add the final line
            if (index === words.length - 1 && currentLine !== "") {
              lines.push({
                startTime: lineStartTime,
                endTime: lineEndTime,
                text: currentLine.trim()
              });
            }
          });
        }
      }

      // Check if the result is an array of lyrics lines (direct format from Music.ai)
      if (Array.isArray(result) && result.length > 0) {
        console.log("Result is an array of lyrics lines, processing directly");

        result.forEach((item: LyricsLineData) => {
          if (item.text && (item.start !== undefined || item.startTime !== undefined) &&
              (item.end !== undefined || item.endTime !== undefined)) {
            lines.push({
              startTime: parseFloat(String(item.start || item.startTime || 0)),
              endTime: parseFloat(String(item.end || item.endTime || 0)),
              text: item.text.trim()
            });
          }
        });
      }

      // If we couldn't extract any lines, return an error
      if (lines.length === 0) {
        console.warn("Could not extract any lyrics lines from the API response");
        return {
          lines: [],
          error: "No lyrics detected in this audio. This may be an instrumental track or the vocals are too quiet for accurate transcription."
        };
      }

      console.log(`Processed ${lines.length} lyrics lines`);
      return { lines };
    } catch (error) {
      console.error("Error processing lyrics result:", error);
      // Return an empty result with error message instead of fallback lyrics
      return {
        lines: [],
        error: "Error processing lyrics: " + (error instanceof Error ? error.message : String(error))
      };
    }
  }

  /**
   * Process the raw chord result from Music.ai API
   * @param result Raw API result
   * @returns Structured chord data
   */
  processChordResult = (result: MusicAiJobResult): ChordData[] => {
    try {
      console.log("Processing chord result:", JSON.stringify(result, null, 2));

      const chords: ChordData[] = [];

      // Check if the result is empty or doesn't have the expected structure
      if (!result || Object.keys(result).length === 0) {
        console.warn("Empty result from Music.ai API. The workflow may not be configured for chord recognition.");
        return [];
      }

      // Process the chords from the API response
      // The Music.ai API might return chords in different formats
      if (result.chords && Array.isArray(result.chords)) {
        // Format 1: Array of chord objects with time and name properties
        result.chords.forEach((chord: ChordResultData) => {
          if (chord.time !== undefined && chord.name) {
            chords.push({
              time: parseFloat(String(chord.time)),
              chord: chord.name
            });
          } else if (chord.time !== undefined && chord.chord) {
            // Alternative property name
            chords.push({
              time: parseFloat(String(chord.time)),
              chord: chord.chord
            });
          }
        });
      }

      // If we couldn't extract any chords, log a warning but don't throw an error
      // Some songs might not have detectable chords
      if (chords.length === 0) {
        console.warn("Could not extract any chords from the API response");
      } else {
        console.log(`Processed ${chords.length} chords`);
      }

      return chords;
    } catch (error) {
      console.error("Error processing chord result:", error);
      // Return an empty array instead of throwing an error
      return [];
    }
  }

  /**
   * Check if a workflow is suitable for lyrics transcription
   * @param workflow The workflow to check
   * @returns True if the workflow is suitable for lyrics transcription
   */
  private isLyricsWorkflow = (workflow: { slug: string; name: string; description?: string }): boolean => {
    // We only use Music.ai API for lyrics transcription, never for chord or beat detection

    // Check for known lyrics-only workflows by slug
    if (workflow.slug && typeof workflow.slug === 'string') {
      const knownLyricsWorkflowSlugs = [
        'untitled-workflow-1b8940f', // Lyric Transcription and Alignment
        'untitled-workflow-1b8813b'  // Alternative lyrics workflow
      ];

      if (knownLyricsWorkflowSlugs.includes(workflow.slug)) {
        return true;
      }
    }

    // Check if the workflow name or description contains lyrics-related keywords
    const lyricsKeywords = ['lyric', 'lyrics', 'transcription', 'transcribe', 'text', 'word'];

    // Check the name
    if (workflow.name && typeof workflow.name === 'string') {
      const name = workflow.name.toLowerCase();
      if (lyricsKeywords.some(keyword => name.includes(keyword))) {
        return true;
      }
    }

    // Check the description
    if (workflow.description && typeof workflow.description === 'string') {
      const description = workflow.description.toLowerCase();
      if (lyricsKeywords.some(keyword => description.includes(keyword))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a workflow is suitable for chord recognition
   * @param workflow The workflow to check
   * @returns True if the workflow is suitable for chord recognition
   */
  private isChordWorkflow = (workflow: { slug: string; name: string; description?: string }): boolean => {
    // Check if the workflow name or description contains chord-related keywords
    const chordKeywords = ['chord', 'harmony', 'music', 'note', 'beat', 'mapping'];

    // Check the name
    if (workflow.name && typeof workflow.name === 'string') {
      const name = workflow.name.toLowerCase();
      if (chordKeywords.some(keyword => name.includes(keyword))) {
        return true;
      }
    }

    // Check the description
    if (workflow.description && typeof workflow.description === 'string') {
      const description = workflow.description.toLowerCase();
      if (chordKeywords.some(keyword => description.includes(keyword))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create an empty lyrics object with an error message
   * @param errorMessage Error message to include
   * @returns Empty lyrics data with error message
   */
  private createEmptyLyricsWithError = (errorMessage: string): LyricsData => {
    console.warn(`Creating empty lyrics with error: ${errorMessage}`);
    return {
      lines: [],
      error: errorMessage
    };
  }
}

// Check if API key is available
if (!process.env.MUSIC_AI_API_KEY) {
  console.warn('MUSIC_AI_API_KEY is not defined in environment variables. The Music.ai service will not work properly.');
}

// Create and export the Music.ai service instance
const musicAiService = new MusicAiService();
export default musicAiService;
