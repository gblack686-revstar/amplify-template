import React, { useState, useRef, useCallback } from 'react';
import { Upload, File, X, Check, AlertCircle, FileText } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useProfile } from '../contexts/ProfileContext';
import DocumentService, { DocumentMetadata } from '../services/documentService';

interface DocumentUploadProps {
  onUploadComplete?: (document: DocumentMetadata) => void;
  onClose?: () => void;
}

interface UploadingFile {
  file: File;
  documentType: string;
  progress: number;
  status: 'uploading' | 'processing' | 'ingesting' | 'ready' | 'error';
  statusMessage?: string;
  error?: string;
  documentId?: string;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ onUploadComplete, onClose }) => {
  const { isDarkMode } = useTheme();
  const { getChildName } = useProfile();
  const [selectedFiles, setSelectedFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Default all documents to 'other' type - no user selection needed
  const documentType = 'other';

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];

      if (!allowedTypes.includes(file.type)) {
        const uploadingFile: UploadingFile = {
          file,
          documentType,
          progress: 0,
          status: 'error',
          error: 'Invalid file type. Please upload PDF, images, or Word documents.'
        };
        setSelectedFiles(prev => [...prev, uploadingFile]);
        continue;
      }

      // Validate file size (60MB max)
      if (file.size > 60 * 1024 * 1024) {
        const uploadingFile: UploadingFile = {
          file,
          documentType,
          progress: 0,
          status: 'error',
          error: 'File size exceeds 60MB limit'
        };
        setSelectedFiles(prev => [...prev, uploadingFile]);
        continue;
      }

      // Add to uploading files
      const uploadingFile: UploadingFile = {
        file,
        documentType,
        progress: 0,
        status: 'uploading'
      };

      setSelectedFiles(prev => [...prev, uploadingFile]);

      // Upload file
      try {
        const metadata = await DocumentService.uploadDocument(
          file,
          documentType as any,
          [],
          (progress) => {
            setSelectedFiles(prev =>
              prev.map(f =>
                f.file === file
                  ? { ...f, progress, status: 'uploading', statusMessage: 'Uploading document...' }
                  : f
              )
            );
          }
        );

        // Start polling for status
        setSelectedFiles(prev =>
          prev.map(f =>
            f.file === file
              ? {
                  ...f,
                  status: 'processing',
                  documentId: metadata.documentId,
                  statusMessage: 'Processing document...',
                  progress: 30
                }
              : f
          )
        );

        // Poll for completion
        try {
          await DocumentService.pollDocumentStatus(
            metadata.documentId,
            (status, message, progress) => {
              setSelectedFiles(prev =>
                prev.map(f =>
                  f.file === file
                    ? {
                        ...f,
                        status: status as any,
                        statusMessage: message,
                        progress
                      }
                    : f
                )
              );
            }
          );

          onUploadComplete?.(metadata);
        } catch (pollingError) {
          console.error('Status polling error:', pollingError);
          // Keep the last known status, don't mark as error
        }
      } catch (error) {
        // Mark as error
        setSelectedFiles(prev =>
          prev.map(f =>
            f.file === file
              ? {
                  ...f,
                  status: 'error',
                  error: error instanceof Error ? error.message : 'Upload failed',
                  statusMessage: 'Upload failed'
                }
              : f
          )
        );
      }
    }
  };

  const removeFile = (file: File) => {
    setSelectedFiles(prev => prev.filter(f => f.file !== file));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusIcon = (file: UploadingFile) => {
    if (file.status === 'ready') {
      return <Check className="w-5 h-5 text-green-500" />;
    }
    if (file.status === 'error') {
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
    return (
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
    );
  };

  const hasCompletedUploads = selectedFiles.some(f => f.status === 'ready');

  return (
    <div className={`h-full flex flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`border-b p-6 ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Upload Documents
              </h1>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {getChildName()
                  ? `Add ${getChildName()}'s IEPs, medical records, therapy reports, and other documents`
                  : 'Add IEPs, medical records, therapy reports, and other documents'}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode
                  ? 'hover:bg-gray-700 text-gray-400'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Drag and Drop Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-6 p-8 border-2 border-dashed rounded-xl transition-all cursor-pointer ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : isDarkMode
                ? 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                : 'border-gray-300 hover:border-gray-400 bg-white'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="text-center">
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <p className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Drop files here or click to browse
            </p>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Supports PDF, images, and Word documents (max 60MB each)
            </p>
          </div>
        </div>

        {/* Uploaded Files List */}
        {selectedFiles.length > 0 && (
          <div className="space-y-3">
            <h3 className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Upload Progress
            </h3>
            {selectedFiles.map((uploadingFile, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  isDarkMode
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <FileText className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className={`text-sm font-medium truncate ${
                        isDarkMode ? 'text-gray-200' : 'text-gray-900'
                      }`}>
                        {uploadingFile.file.name}
                      </p>
                      <div className="flex items-center space-x-2 ml-2">
                        {getStatusIcon(uploadingFile)}
                        <button
                          onClick={() => removeFile(uploadingFile.file)}
                          className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>
                        {formatFileSize(uploadingFile.file.size)}
                      </span>
                      <span className={
                        uploadingFile.status === 'ready'
                          ? 'text-green-500 font-medium'
                          : uploadingFile.status === 'error'
                            ? 'text-red-500'
                            : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }>
                        {uploadingFile.statusMessage || `${uploadingFile.progress}%`}
                      </span>
                    </div>
                    {(uploadingFile.status === 'uploading' || uploadingFile.status === 'processing' || uploadingFile.status === 'ingesting') && (
                      <div className={`mt-2 h-1 rounded-full overflow-hidden ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                      }`}>
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300"
                          style={{ width: `${uploadingFile.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Box */}
        <div className={`mt-6 p-4 rounded-lg ${
          isDarkMode ? 'bg-blue-900/20 border border-blue-800/30' : 'bg-blue-50 border border-blue-200'
        }`}>
          <div className="flex items-start space-x-3">
            <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              isDarkMode ? 'text-blue-400' : 'text-blue-600'
            }`} />
            <div className={`text-sm ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
              <p className="font-medium mb-1">Documents are automatically processed</p>
              <p className={isDarkMode ? 'text-blue-300' : 'text-blue-700'}>
                After uploading, your documents will be analyzed by AI to extract key information.
                This process may take a few minutes. You can continue using the app while documents are being processed.
              </p>
            </div>
          </div>
        </div>

        {/* Return to Chat Button */}
        {hasCompletedUploads && onClose && (
          <div className="mt-6">
            <button
              onClick={onClose}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                isDarkMode
                  ? 'bg-gradient-to-r from-blue-600 to-purple-700 hover:from-blue-700 hover:to-purple-800 text-white'
                  : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white'
              }`}
            >
              Return to Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentUpload;
