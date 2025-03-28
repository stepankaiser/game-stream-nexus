
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Upload, Check, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  className?: string;
  acceptedFileTypes?: string;
  maxFileSizeMB?: number;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  className,
  acceptedFileTypes = ".zip,.rar,.7z,.exe,.dmg",
  maxFileSizeMB = 2000 // 2GB max size
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setError(null);

    // Check file size
    if (file.size > maxFileSizeMB * 1024 * 1024) {
      setError(`File size exceeds the maximum limit of ${maxFileSizeMB}MB`);
      return;
    }

    // Check file type if acceptedFileTypes is provided
    if (acceptedFileTypes && acceptedFileTypes !== "*") {
      const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
      const acceptedTypes = acceptedFileTypes.split(',');
      
      if (!acceptedTypes.some(type => type.trim() === fileExtension || type.trim() === file.type)) {
        setError(`File type not accepted. Please upload: ${acceptedFileTypes}`);
        return;
      }
    }

    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  };

  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const formatFileSize = (sizeInBytes: number): string => {
    if (sizeInBytes < 1024) {
      return `${sizeInBytes} B`;
    } else if (sizeInBytes < 1024 * 1024) {
      return `${(sizeInBytes / 1024).toFixed(2)} KB`;
    } else if (sizeInBytes < 1024 * 1024 * 1024) {
      return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
    } else {
      return `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={acceptedFileTypes}
        className="hidden"
        aria-label="Upload file"
      />
      
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-300",
          "hover:border-cyber-neon-blue hover:bg-cyber-dark/40",
          {
            "border-cyber-neon-purple bg-cyber-dark/20": isDragging,
            "border-cyber-purple/50 bg-transparent": !isDragging && !selectedFile,
            "border-green-500/50 bg-green-500/10": !isDragging && selectedFile && !error,
            "border-destructive/50 bg-destructive/10": error
          }
        )}
      >
        {error ? (
          <div className="py-4">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-2" />
            <p className="text-destructive font-medium">{error}</p>
            <Button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setError(null); 
                setSelectedFile(null);
              }}
              variant="outline"
              className="mt-4 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              Try Again
            </Button>
          </div>
        ) : selectedFile ? (
          <div className="py-4">
            <Check className="mx-auto h-12 w-12 text-green-500 mb-2" />
            <p className="text-green-400 font-medium">{selectedFile.name}</p>
            <p className="text-muted-foreground text-sm mt-1">
              {formatFileSize(selectedFile.size)}
            </p>
            <Button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setSelectedFile(null);
              }}
              variant="outline"
              className="mt-4 text-muted-foreground hover:text-white"
            >
              Change File
            </Button>
          </div>
        ) : (
          <div className="py-4">
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-white font-medium">
              Drag and drop your game build here or click to browse
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              Accepted formats: .zip, .rar, .7z, .exe, .dmg (Max: {maxFileSizeMB}MB)
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
