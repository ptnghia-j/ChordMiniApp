/**
 * Custom Music.ai API Client
 *
 * This client provides a more flexible interface to the Music.ai API
 * than the official SDK, with better error handling and fallbacks.
 */

import axios from 'axios';

// Helper function to create a fetch-based fallback client
const createFetchFallback = () => {
  return {
    post: async (url: string, data: any, config: any) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify(data)
      });

      return {
        status: response.status,
        data: await response.json()
      };
    },
    get: async (url: string, config: any) => {
      const response = await fetch(url, {
        method: 'GET',
        headers: config.headers
      });

      return {
        status: response.status,
        data: await response.json()
      };
    },
    isAxiosError: () => false,
  };
};

// Define types for the Music.ai API responses
interface MusicAiJob {
  id: string;
  status: string;
  result?: any;
  error?: string;
}

export class CustomMusicAiClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.music.ai';
  private apiPath: string = 'api'; // According to the documentation, the endpoint is /api/job
  private timeout: number;
  private retries: number;

  constructor(config: { apiKey: string; timeout?: number; retries?: number }) {
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 60000; // Default 60 seconds
    this.retries = config.retries || 3; // Default 3 retries

    console.log(`[CustomMusicAiClient] Initialized with API key length: ${this.apiKey.length}`);
    console.log(`[CustomMusicAiClient] Using axios library`);
    console.log(`[CustomMusicAiClient] Base URL: ${this.baseUrl}`);
    console.log(`[CustomMusicAiClient] API Path: ${this.apiPath}`);
    console.log(`[CustomMusicAiClient] Full API endpoint: ${this.baseUrl}/${this.apiPath}/job`);

    // Set up error handling for axios
    this.setupAxiosErrorHandling();
  }

  /**
   * Set up error handling for axios
   */
  private setupAxiosErrorHandling() {
    try {
      // Add request interceptor
      axios.interceptors.request.use(
        (config) => {
          // Add a timeout to all requests
          config.timeout = this.timeout;
          return config;
        },
        (error) => {
          console.error(`[CustomMusicAiClient] Request error:`, error);
          return Promise.reject(error);
        }
      );

      // Add response interceptor
      axios.interceptors.response.use(
        (response) => {
          return response;
        },
        (error) => {
          console.error(`[CustomMusicAiClient] Response error:`, error);
          return Promise.reject(error);
        }
      );
    } catch (error) {
      console.warn(`[CustomMusicAiClient] Failed to set up axios interceptors:`, error);
      // If axios interceptors fail, we'll just continue without them
    }
  }

  /**
   * Create a new job in the Music.ai API
   * @param workflow The workflow to use (e.g., "lyrics-transcription")
   * @param params The parameters for the job
   * @returns The job ID
   */
  async addJob(workflow: string, params: Record<string, any>) {
    console.log(`[CustomMusicAiClient] Creating job with workflow: ${workflow}`);
    console.log(`[CustomMusicAiClient] Parameters:`, JSON.stringify(params, null, 2));

    try {
      // Create the request payload according to the API documentation
      // The correct format is: { name, workflow, params, metadata }
      const payload = {
        name: `${workflow} job`, // Job name for identification
        workflow, // Workflow slug
        params, // Workflow params - this is required even if empty
        metadata: { // Optional metadata
          source: 'ChordMiniApp',
          timestamp: new Date().toISOString()
        }
      };

      // According to the API documentation, the correct endpoint is /api/job
      const endpoint = `${this.baseUrl}/${this.apiPath}/job`;

      // According to the API documentation, the correct auth header is 'Authorization'
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey
      };

      console.log(`[CustomMusicAiClient] Sending request to: ${endpoint}`);

      try {
        const response = await axios.post(endpoint, payload, {
          headers,
          timeout: this.timeout
        });

        if (response && response.status === 200) {
          console.log(`[CustomMusicAiClient] Success with endpoint: ${endpoint}`);
          console.log(`[CustomMusicAiClient] Response status: ${response.status}`);
          console.log(`[CustomMusicAiClient] Response data: ${JSON.stringify(response.data, null, 2)}`);

          // Check if the response has an ID
          if (response.data && response.data.id) {
            console.log(`[CustomMusicAiClient] Job created with ID: ${response.data.id}`);
            return response.data.id;
          }
        }

        throw new Error(`Failed to create job: Unexpected response: ${JSON.stringify(response?.data)}`);
      } catch (error) {
        // If the standard endpoint fails, try fallback options
        console.log(`[CustomMusicAiClient] Standard endpoint failed: ${error.message}`);
        console.log('[CustomMusicAiClient] Trying fallback options...');

        // Fallback to trying multiple endpoints and auth headers
        const endpoints = [
          `${this.baseUrl}/${this.apiPath}/jobs`,          // Plural endpoint
          `${this.baseUrl}/job`,                           // Direct job endpoint
          `${this.baseUrl}/jobs`                           // Direct plural endpoint
        ];

        const authHeaders = [
          { 'Authorization': `Bearer ${this.apiKey}` },    // Bearer token
          { 'X-API-Key': this.apiKey },                    // X-API-Key
          { 'Api-Key': this.apiKey }                       // Api-Key
        ];

        let response = null;
        let lastError = error;

        for (const endpoint of endpoints) {
          for (const authHeader of authHeaders) {
            try {
              console.log(`[CustomMusicAiClient] Trying fallback endpoint: ${endpoint} with auth type: ${Object.keys(authHeader)[0]}`);

              response = await axios.post(endpoint, payload, {
                headers: {
                  ...authHeader,
                  'Content-Type': 'application/json'
                },
                timeout: this.timeout
              });

              // If we get here, the request succeeded
              console.log(`[CustomMusicAiClient] Success with fallback endpoint: ${endpoint}`);
              break;
            } catch (e) {
              lastError = e;
              // Continue to the next endpoint/auth combination
            }
          }

          // If we got a successful response, break out of the outer loop too
          if (response) break;
        }

        // If all endpoints failed, try the fetch fallback with the original endpoint
        if (!response) {
          console.error(`[CustomMusicAiClient] All axios requests failed, trying fetch fallback:`, lastError);

          // Try with fetch as a fallback
          const fetchClient = createFetchFallback();
          response = await fetchClient.post(`${this.baseUrl}/${this.apiPath}/job`, payload, {
            headers: {
              'Authorization': this.apiKey, // According to the documentation, it's just the API key
              'Content-Type': 'application/json'
            }
          });
        }

        // Check if the response is valid
        console.log(`[CustomMusicAiClient] Response status: ${response.status}`);
        console.log(`[CustomMusicAiClient] Response data:`, JSON.stringify(response.data, null, 2));

        if (response.status !== 200 || !response.data || !response.data.id) {
          console.error(`[CustomMusicAiClient] Invalid response status: ${response.status}`);
          console.error(`[CustomMusicAiClient] Response data:`, JSON.stringify(response.data, null, 2));

          // Provide more specific error message based on the response
          let errorMessage = 'Invalid response from Music.ai API';
          if (response.data && response.data.message) {
            errorMessage = `Music.ai API error: ${response.data.message}`;
          } else if (response.status === 401) {
            errorMessage = 'Unauthorized: Invalid API key or authentication failed';
          } else if (response.status === 404) {
            errorMessage = 'API endpoint not found: Check the API URL and version';
          }

          throw new Error(errorMessage);
        }

        const jobId = response.data.id;
        console.log(`[CustomMusicAiClient] Job created with ID: ${jobId}`);
        return jobId;
      }
    } catch (error) {
      console.error(`[CustomMusicAiClient] Error creating job:`, error);

      // Provide more detailed error information
      if (typeof axios.isAxiosError === 'function' && axios.isAxiosError(error)) {
        if (error.response) {
          console.error(`[CustomMusicAiClient] Response status: ${error.response.status}`);
          console.error(`[CustomMusicAiClient] Response data:`, error.response.data);
        } else if (error.request) {
          console.error(`[CustomMusicAiClient] No response received`);
        }
      } else {
        // Handle non-axios errors or when using the fetch fallback
        console.error(`[CustomMusicAiClient] Error details:`, error.message || error);
      }

      throw error;
    }
  }

  /**
   * Wait for a job to complete
   * @param jobId The job ID to wait for
   * @param timeout Maximum time to wait in milliseconds
   * @returns The completed job
   */
  async waitForJobCompletion(jobId: string, timeout = 300000) {
    console.log(`[CustomMusicAiClient] Waiting for job ${jobId} to complete (timeout: ${timeout}ms)`);

    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < timeout) {
      try {
        // Get the job status
        const job = await this.getJob(jobId);

        // Check if the job is complete
        if (job.status === 'SUCCEEDED') {
          console.log(`[CustomMusicAiClient] Job ${jobId} succeeded`);

          // Check if the result is empty
          if (!job.result || Object.keys(job.result).length === 0) {
            console.warn(`[CustomMusicAiClient] Job ${jobId} succeeded but returned empty result`);
            // Don't throw an error, just return the job with empty result
            // The calling code will handle this case
          }

          return job;
        } else if (job.status === 'FAILED') {
          console.error(`[CustomMusicAiClient] Job ${jobId} failed:`, job.error);

          // Log more details about the job
          console.error(`[CustomMusicAiClient] Failed job details:`, JSON.stringify(job, null, 2));

          // Create a more descriptive error message
          let errorMessage = job.error || 'Unknown error';
          if (job.result && Object.keys(job.result).length > 0) {
            errorMessage += ` - Result: ${JSON.stringify(job.result)}`;
          }

          throw new Error(`Job failed: ${errorMessage}`);
        } else {
          console.log(`[CustomMusicAiClient] Job ${jobId} status: ${job.status}`);
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error(`[CustomMusicAiClient] Error polling job:`, error);
        throw error;
      }
    }

    throw new Error(`Job ${jobId} timed out after ${timeout}ms`);
  }

  /**
   * Get a job from the Music.ai API
   * @param jobId The job ID to get
   * @returns The job
   */
  async getJob(jobId: string) {
    try {
      // Try multiple API endpoint formats
      const endpoints = [
        `${this.baseUrl}/${this.apiPath}/job/${jobId}`,           // Standard endpoint
        `${this.baseUrl}/${this.apiPath}/jobs/${jobId}`,          // Plural endpoint
        `${this.baseUrl}/${this.apiPath}/workflow/job/${jobId}`,  // Workflow-specific endpoint
        `${this.baseUrl}/${this.apiPath}/workflows/job/${jobId}`, // Plural workflow endpoint
        `${this.baseUrl}/job/${jobId}`,                           // Direct job endpoint
        `${this.baseUrl}/jobs/${jobId}`,                          // Direct plural endpoint
        `${this.baseUrl}/v1/${this.apiPath}/job/${jobId}`,        // With version prefix
        `${this.baseUrl}/v1/job/${jobId}`                         // Direct with version
      ];

      // Try different authorization header formats
      const authHeaders = [
        { 'Authorization': this.apiKey },                // Standard
        { 'Authorization': `Bearer ${this.apiKey}` },    // Bearer token
        { 'X-API-Key': this.apiKey },                    // X-API-Key
        { 'Api-Key': this.apiKey },                      // Api-Key
        { 'apikey': this.apiKey }                        // lowercase
      ];

      // Try each endpoint with each auth header until one works
      let response = null;
      let lastError = null;

      for (const endpoint of endpoints) {
        for (const authHeader of authHeaders) {
          try {
            response = await axios.get(endpoint, {
              headers: {
                ...authHeader,
                'Content-Type': 'application/json'
              },
              timeout: this.timeout
            });

            // If we get here, the request succeeded
            console.log(`[CustomMusicAiClient] Success with endpoint: ${endpoint}`);
            break;
          } catch (error) {
            lastError = error;
            // Continue to the next endpoint/auth combination
          }
        }

        // If we got a successful response, break out of the outer loop too
        if (response) break;
      }

      // If all endpoints failed, try the fetch fallback with the original endpoint
      if (!response) {
        console.error(`[CustomMusicAiClient] All axios requests failed, trying fetch fallback:`, lastError);

        // Try with fetch as a fallback
        const fetchClient = createFetchFallback();
        response = await fetchClient.get(`${this.baseUrl}/${this.apiPath}/job/${jobId}`, {
          headers: {
            'Authorization': this.apiKey, // According to the documentation, it's just the API key
            'Content-Type': 'application/json'
          }
        });
      }

      // Check if the response is valid
      console.log(`[CustomMusicAiClient] Response status: ${response.status}`);
      console.log(`[CustomMusicAiClient] Response data:`, JSON.stringify(response.data, null, 2));

      if (response.status !== 200 || !response.data) {
        console.error(`[CustomMusicAiClient] Invalid response status: ${response.status}`);
        console.error(`[CustomMusicAiClient] Response data:`, JSON.stringify(response.data, null, 2));

        // Provide more specific error message based on the response
        let errorMessage = 'Invalid response from Music.ai API';
        if (response.data && response.data.message) {
          errorMessage = `Music.ai API error: ${response.data.message}`;
        } else if (response.status === 401) {
          errorMessage = 'Unauthorized: Invalid API key or authentication failed';
        } else if (response.status === 404) {
          errorMessage = 'API endpoint not found: Check the API URL and version';
        }

        throw new Error(errorMessage);
      }

      return response.data as MusicAiJob;
    } catch (error) {
      console.error(`[CustomMusicAiClient] Error getting job:`, error);
      throw error;
    }
  }

  /**
   * List available workflows from the Music.ai API
   * @returns Array of available workflows
   */
  async listWorkflows() {
    try {
      console.log(`[CustomMusicAiClient] Listing available workflows...`);

      // Try multiple API endpoint formats
      const endpoints = [
        `${this.baseUrl}/${this.apiPath}/workflow`,           // Standard endpoint
        `${this.baseUrl}/${this.apiPath}/workflows`,          // Plural endpoint
        `${this.baseUrl}/workflow`,                           // Direct endpoint
        `${this.baseUrl}/workflows`,                          // Direct plural endpoint
        `${this.baseUrl}/v1/${this.apiPath}/workflow`,        // With version prefix
        `${this.baseUrl}/v1/workflow`,                        // Direct with version
        `${this.baseUrl}/v1/${this.apiPath}/workflows`,       // Plural with version
        `${this.baseUrl}/v1/workflows`                        // Direct plural with version
      ];

      // Try different authorization header formats
      const authHeaders = [
        { 'Authorization': this.apiKey },                // Standard
        { 'Authorization': `Bearer ${this.apiKey}` },    // Bearer token
        { 'X-API-Key': this.apiKey },                    // X-API-Key
        { 'Api-Key': this.apiKey },                      // Api-Key
        { 'apikey': this.apiKey }                        // lowercase
      ];

      // Try each endpoint with each auth header until one works
      let response = null;
      let lastError = null;

      for (const endpoint of endpoints) {
        for (const authHeader of authHeaders) {
          try {
            response = await axios.get(endpoint, {
              headers: {
                ...authHeader,
                'Content-Type': 'application/json'
              },
              timeout: this.timeout
            });

            // If we get here, the request succeeded
            console.log(`[CustomMusicAiClient] Success with endpoint: ${endpoint}`);
            break;
          } catch (error) {
            lastError = error;
            // Continue to the next endpoint/auth combination
          }
        }

        // If we got a successful response, break out of the outer loop too
        if (response) break;
      }

      // If all endpoints failed, try the fetch fallback with the original endpoint
      if (!response) {
        console.error(`[CustomMusicAiClient] All axios requests failed, trying fetch fallback:`, lastError);

        // Try with fetch as a fallback
        const fetchClient = createFetchFallback();
        response = await fetchClient.get(`${this.baseUrl}/${this.apiPath}/workflow`, {
          headers: {
            'Authorization': this.apiKey,
            'Content-Type': 'application/json'
          }
        });
      }

      // Check if the response is valid
      console.log(`[CustomMusicAiClient] Workflows response status: ${response.status}`);
      console.log(`[CustomMusicAiClient] Workflows response data:`, JSON.stringify(response.data, null, 2));

      if (response.status !== 200 || !response.data || !response.data.workflows) {
        console.error(`[CustomMusicAiClient] Invalid workflows response:`, response.data);
        return [];
      }

      return response.data.workflows;
    } catch (error) {
      console.error(`[CustomMusicAiClient] Error listing workflows:`, error);
      return [];
    }
  }

  /**
   * Upload a file to the Music.ai API
   * @param filePath The path to the file to upload
   * @returns The URL of the uploaded file
   */
  async uploadFile(filePath: string) {
    // This is a placeholder - we would need to implement file upload logic
    // For now, we'll just return the file path as is
    console.log(`[CustomMusicAiClient] Upload not implemented, using file path: ${filePath}`);
    return filePath;
  }
}
