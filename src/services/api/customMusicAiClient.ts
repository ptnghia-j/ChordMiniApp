/**
 * Custom Music.ai API Client
 *
 * This client provides a more flexible interface to the Music.ai API
 * than the official SDK, with better error handling and fallbacks.
 */

import axios from 'axios';

// Types for fetch fallback client
interface FetchConfig {
  headers: Record<string, string>;
  timeout?: number;
}

interface FetchResponse<T = unknown> {
  status: number;
  data: T;
}

// Helper function to create a fetch-based fallback client
const createFetchFallback = () => {
  return {
    post: async <T = unknown>(url: string, data: unknown, config: FetchConfig): Promise<FetchResponse<T>> => {
      const response = await fetch(url, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify(data)
      });

      return {
        status: response.status,
        data: await response.json() as T
      };
    },
    get: async <T = unknown>(url: string, config: FetchConfig): Promise<FetchResponse<T>> => {
      const response = await fetch(url, {
        method: 'GET',
        headers: config.headers
      });

      return {
        status: response.status,
        data: await response.json() as T
      };
    },
    isAxiosError: () => false,
  };
};

// Define types for the Music.ai API responses
interface MusicAiJob {
  id: string;
  status: string;
  result?: Record<string, unknown>;
  error?: string;
}

export class CustomMusicAiClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.music.ai';
  private apiPath: string = 'api'; // According to the documentation, the endpoint is /api/job
  private timeout: number;
  private retries: number;

  constructor(config: { apiKey: string; timeout?: number; retries?: number; baseUrl?: string; apiPath?: string }) {
    this.apiKey = config.apiKey || '';
    this.timeout = config.timeout || 120000; // Default 120 seconds (maximum allowed)
    this.retries = config.retries || 3; // Default 3 retries

    // Allow overriding the base URL and API path
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    }

    if (config.apiPath) {
      this.apiPath = config.apiPath;
    }



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
  async addJob(workflow: string, params: Record<string, string | number | boolean | object>) {
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

      // According to the API documentation, the correct auth header is 'Authorization: your-api-key-here'
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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`[CustomMusicAiClient] Standard endpoint failed: ${errorMessage}`);
        console.log('[CustomMusicAiClient] Trying fallback options...');

        // Fallback to trying multiple endpoints and auth headers
        const endpoints = [
          `${this.baseUrl}/${this.apiPath}/jobs`,          // Plural endpoint
          `${this.baseUrl}/job`,                           // Direct job endpoint
          `${this.baseUrl}/jobs`                           // Direct plural endpoint
        ];

        const authHeaders = [
          { 'Authorization': this.apiKey },                // Just the API key (correct according to docs)
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
              'Authorization': this.apiKey, // According to the documentation, it should be just the API key
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[CustomMusicAiClient] Error details:`, errorMessage);
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

          // Check if there's any result data that might contain error details
          if (job.result && Object.keys(job.result).length > 0) {
            errorMessage += ` - Result: ${JSON.stringify(job.result)}`;
          }

          // Check if the error is related to file access
          if (errorMessage.includes('not found') || errorMessage.includes('access') ||
              errorMessage.includes('permission') || errorMessage.includes('denied')) {
            errorMessage = `File access error: ${errorMessage}. The API may not be able to access the uploaded file.`;
          }

          // Check if it's a workflow-related error
          if (errorMessage.includes('workflow')) {
            errorMessage = `Workflow error: ${errorMessage}. The specified workflow may not be configured correctly.`;
          }

          // If it's just "Unknown error", provide more context
          if (errorMessage === 'Unknown error') {
            errorMessage = 'Unknown error. This could be due to file format issues, API limitations, or server problems. Try with a different audio file or workflow.';
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
        { 'Authorization': this.apiKey },                // Just the API key (correct according to docs)
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
            'Authorization': this.apiKey, // According to the documentation, it should be just the API key
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
        { 'Authorization': this.apiKey },                // Just the API key (correct according to docs)
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
            'Authorization': this.apiKey, // According to the documentation, it should be just the API key
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
   * Get signed URLs for file upload from Music.ai API
   * @returns Object containing uploadUrl and downloadUrl
   */
  async getSignedUrls() {
    console.log(`[CustomMusicAiClient] Requesting signed URLs for file upload`);

    try {
      // The Music.ai API endpoint for file uploads might be at different paths
      // Let's try multiple possible endpoints
      const possibleEndpoints = [
        `${this.baseUrl}/${this.apiPath}/upload`,
        `${this.baseUrl}/upload`,
        `${this.baseUrl}/api/v1/upload`,
        `${this.baseUrl}/v1/upload`
      ];

      const headers = {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json'
      };

      let response = null;
      let lastError = null;

      // Try each endpoint until one works
      for (const endpoint of possibleEndpoints) {
        try {
          console.log(`[CustomMusicAiClient] Trying endpoint: ${endpoint}`);
          // According to the documentation, we should use GET, not POST
          response = await axios.get(endpoint, {
            headers,
            timeout: this.timeout
          });

          // If we get here, the request succeeded
          console.log(`[CustomMusicAiClient] Successfully got signed URLs from: ${endpoint}`);
          break;
        } catch (error) {
          console.log(`[CustomMusicAiClient] Endpoint ${endpoint} failed:`, error instanceof Error ? error.message : String(error));
          lastError = error;
        }
      }

      // If all endpoints failed, throw the last error
      if (!response) {
        throw lastError;
      }

      if (response && response.status === 200 && response.data) {
        console.log(`[CustomMusicAiClient] Successfully got signed URLs`);
        console.log(`[CustomMusicAiClient] Upload URL: ${response.data.uploadUrl}`);
        console.log(`[CustomMusicAiClient] Download URL: ${response.data.downloadUrl}`);

        return {
          uploadUrl: response.data.uploadUrl,
          downloadUrl: response.data.downloadUrl
        };
      } else {
        throw new Error(`Failed to get signed URLs: ${response?.status} ${JSON.stringify(response?.data)}`);
      }
    } catch (error) {
      console.error(`[CustomMusicAiClient] Error getting signed URLs:`, error);
      if (axios.isAxiosError(error) && error.response) {
        console.error(`[CustomMusicAiClient] Response status: ${error.response.status}`);
        console.error(`[CustomMusicAiClient] Response data:`, error.response.data);
      }
      throw error;
    }
  }

  /**
   * Upload a file to the Music.ai API using their temporary upload server
   * @param fileData The file data as Buffer, Blob, or ArrayBuffer
   * @param contentType The content type of the file (e.g., 'audio/mpeg')
   * @returns The download URL of the uploaded file
   */
  async uploadFile(fileData: Buffer | Blob | ArrayBuffer, contentType: string = 'audio/mpeg') {
    console.log(`[CustomMusicAiClient] Uploading file to Music.ai API`);

    try {
      // Step 1: Get signed URLs
      const { uploadUrl, downloadUrl } = await this.getSignedUrls();

      // Step 2: Upload the file to the uploadUrl

      // Convert ArrayBuffer to Buffer if needed
      let data: Buffer | Blob;
      if (fileData instanceof ArrayBuffer) {
        data = Buffer.from(fileData);
      } else {
        data = fileData;
      }

      const uploadResponse = await axios.put(uploadUrl, data, {
        headers: {
          'Content-Type': contentType
        },
        timeout: this.timeout * 2 // Double timeout for uploads
      });

      if (uploadResponse && uploadResponse.status >= 200 && uploadResponse.status < 300) {

        // Verify the file is accessible
        try {
          const verifyResponse = await axios.head(downloadUrl, { timeout: this.timeout });

          if (verifyResponse.status !== 200) {
            console.warn(`[CustomMusicAiClient] File may not be accessible at the download URL. Status: ${verifyResponse.status}`);
          }
        } catch (verifyError) {
          console.warn(`[CustomMusicAiClient] Could not verify file accessibility: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
          // Continue anyway, as the file might still be processing
        }

        // Return the download URL to be used in job creation
        return downloadUrl;
      } else {
        throw new Error(`Failed to upload file: ${uploadResponse?.status} ${JSON.stringify(uploadResponse?.data)}`);
      }
    } catch (error) {
      console.error(`[CustomMusicAiClient] Error uploading file:`, error);
      if (axios.isAxiosError(error) && error.response) {
        console.error(`[CustomMusicAiClient] Response status: ${error.response.status}`);
        console.error(`[CustomMusicAiClient] Response data:`, error.response.data);
      }
      throw error;
    }
  }

  /**
   * Upload a local file to the Music.ai API
   * @param filePath Path to the local file
   * @param contentType The content type of the file (e.g., 'audio/mpeg')
   * @returns The download URL of the uploaded file
   */
  async uploadLocalFile(filePath: string, contentType: string = 'audio/mpeg') {
    try {
      // Import fs module
      const fs = await import('fs/promises');

      // Read the file
      const fileData = await fs.readFile(filePath);

      // Upload the file
      return await this.uploadFile(fileData, contentType);
    } catch (error) {
      console.error(`[CustomMusicAiClient] Error uploading local file:`, error);
      throw error;
    }
  }
}
