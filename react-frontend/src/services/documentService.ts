import { config } from '../config/env';

interface UploadRequest {
  filename: string;
  documentType: 'iep' | 'aba_report' | 'medical_record' | 'other';
  contentType: string;
  fileSize: number;
  tags?: string[];
}

interface UploadResponse {
  documentId: string;
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
  message?: string;
}

interface DocumentMetadata {
  documentId: string;
  userId: string;
  documentType: string;
  originalFilename: string;
  s3Key: string;
  fileSize: number;
  mimeType: string;
  currentStatus: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

class DocumentService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = config.apiUrl;
  }

  /**
   * Get presigned URL for document upload
   */
  async getUploadUrl(request: UploadRequest): Promise<UploadResponse> {
    try {
      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.apiUrl}/documents/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get upload URL');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting upload URL:', error);
      throw error;
    }
  }

  /**
   * Upload file to S3 using presigned URL
   */
  async uploadToS3(
    file: File,
    uploadUrl: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    console.log('[DocumentService] Starting S3 upload:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      uploadUrlPrefix: uploadUrl.substring(0, 100) + '...'
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const progress = Math.round((e.loaded / e.total) * 100);
          console.log(`[DocumentService] Upload progress: ${progress}%`);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        console.log('[DocumentService] XHR load event:', {
          status: xhr.status,
          statusText: xhr.statusText,
          responseHeaders: xhr.getAllResponseHeaders()
        });

        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('[DocumentService] Upload successful!');
          resolve();
        } else {
          console.error('[DocumentService] Upload failed with status:', xhr.status);
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', (event) => {
        console.error('[DocumentService] XHR error event:', event);
        reject(new Error('Upload failed'));
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      console.log('[DocumentService] Sending file to S3...');
      xhr.send(file);
    });
  }

  /**
   * Complete document upload workflow
   */
  async uploadDocument(
    file: File,
    documentType: UploadRequest['documentType'],
    tags: string[] = [],
    onProgress?: (progress: number) => void
  ): Promise<DocumentMetadata> {
    console.log('[DocumentService] Starting document upload workflow:', {
      fileName: file.name,
      fileSize: file.size,
      documentType,
      tags
    });

    try {
      // Validate file size (max 60MB)
      const maxSize = 60 * 1024 * 1024;
      if (file.size > maxSize) {
        console.error('[DocumentService] File size exceeds limit:', file.size);
        throw new Error(`File size exceeds maximum allowed size of 60MB`);
      }

      // Step 1: Get presigned URL
      console.log('[DocumentService] Step 1: Getting presigned URL...');
      onProgress?.(0);
      const uploadRequest: UploadRequest = {
        filename: file.name,
        documentType,
        contentType: file.type,
        fileSize: file.size,
        tags
      };

      const uploadResponse = await this.getUploadUrl(uploadRequest);
      console.log('[DocumentService] Presigned URL received:', {
        documentId: uploadResponse.documentId,
        s3Key: uploadResponse.s3Key,
        expiresIn: uploadResponse.expiresIn
      });

      // Step 2: Upload file to S3
      console.log('[DocumentService] Step 2: Uploading to S3...');
      await this.uploadToS3(file, uploadResponse.uploadUrl, (progress) => {
        // Progress: 0-95% for upload, 95-100% for processing
        onProgress?.(Math.min(progress * 0.95, 95));
      });

      // Step 3: Return document metadata
      console.log('[DocumentService] Step 3: Upload complete, returning metadata');
      onProgress?.(100);

      // Note: In production, you might want to poll the status
      // or use WebSocket to get real-time updates on document processing
      return {
        documentId: uploadResponse.documentId,
        userId: localStorage.getItem('user_id') || '',
        documentType,
        originalFilename: file.name,
        s3Key: uploadResponse.s3Key,
        fileSize: file.size,
        mimeType: file.type,
        currentStatus: 'upload_complete',
        tags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error uploading document:', error);
      throw error;
    }
  }

  /**
   * Get list of user's documents
   */
  async getDocuments(
    documentType?: string,
    status?: string,
    limit: number = 50
  ): Promise<DocumentMetadata[]> {
    try {
      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      // Build query parameters
      const params = new URLSearchParams();
      if (documentType) params.append('documentType', documentType);
      if (status) params.append('status', status);
      params.append('limit', limit.toString());

      const queryString = params.toString();
      const url = `${this.apiUrl}/documents${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const data = await response.json();
      return data.documents || [];
    } catch (error) {
      console.error('Error fetching documents:', error);
      throw error;
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string): Promise<void> {
    try {
      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.apiUrl}/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  /**
   * Get a specific document by ID
   */
  async getDocument(documentId: string): Promise<DocumentMetadata> {
    try {
      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.apiUrl}/documents/${documentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch document');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching document:', error);
      throw error;
    }
  }

  /**
   * Get document processing status
   */
  async getDocumentStatus(documentId: string): Promise<{
    documentId: string;
    currentStatus: 'uploading' | 'processing' | 'ingesting' | 'ready' | 'error';
    statusMessage: string;
    progress: number;
    updatedAt: string;
    originalFilename: string;
    documentType: string;
  }> {
    try {
      const authToken = localStorage.getItem('auth_token');
      if (!authToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${this.apiUrl}/documents/${documentId}/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch document status');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching document status:', error);
      throw error;
    }
  }

  /**
   * Poll document status until completion or error
   */
  async pollDocumentStatus(
    documentId: string,
    onProgress: (status: string, message: string, progress: number) => void,
    maxAttempts: number = 60, // Poll for up to 5 minutes (60 * 5 seconds)
    intervalMs: number = 5000 // Poll every 5 seconds
  ): Promise<void> {
    let attempts = 0;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          attempts++;
          const status = await this.getDocumentStatus(documentId);

          console.log('[DocumentService] Status poll:', status);

          onProgress(status.currentStatus, status.statusMessage, status.progress);

          if (status.currentStatus === 'ready') {
            console.log('[DocumentService] Document ready!');
            resolve();
            return;
          }

          if (status.currentStatus === 'error') {
            console.error('[DocumentService] Document processing failed');
            reject(new Error('Document processing failed'));
            return;
          }

          if (attempts >= maxAttempts) {
            console.warn('[DocumentService] Max polling attempts reached');
            reject(new Error('Status polling timeout'));
            return;
          }

          // Continue polling
          setTimeout(poll, intervalMs);
        } catch (error) {
          console.error('[DocumentService] Error polling status:', error);
          reject(error);
        }
      };

      // Start polling
      poll();
    });
  }

  /**
   * Get document categories with display names
   */
  getDocumentTypes(): Array<{ value: UploadRequest['documentType']; label: string; description: string }> {
    return [
      {
        value: 'iep',
        label: 'IEP',
        description: 'Individualized Education Program documents'
      },
      {
        value: 'aba_report',
        label: 'ABA Report',
        description: 'Applied Behavior Analysis therapy reports'
      },
      {
        value: 'medical_record',
        label: 'Medical Record',
        description: 'Medical evaluations and diagnostic reports'
      },
      {
        value: 'other',
        label: 'Other',
        description: 'Other relevant documents'
      }
    ];
  }
}

export default new DocumentService();
export type { UploadRequest, UploadResponse, DocumentMetadata };
