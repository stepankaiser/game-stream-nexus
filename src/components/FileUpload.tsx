import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FolderUp, Check, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  onChange: (files: FileList | null) => void;
  value?: FileList | null;
  className?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onChange,
  value,
  className,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedFiles = value;
  const selectedFolderName = useMemo(() => {
    if (selectedFiles && selectedFiles.length > 0) {
      const firstFile = selectedFiles[0];
      if (firstFile && typeof firstFile.webkitRelativePath === 'string') {
          const pathParts = firstFile.webkitRelativePath.split('/');
          return pathParts[0] || 'Selected Folder'; 
      }
      return 'Selected Folder'; 
    }
    return null;
  }, [selectedFiles]);
  const selectedFileCount = useMemo(() => selectedFiles?.length ?? 0, [selectedFiles]);

  const handleFilesSelected = useCallback((files: FileList | null) => {
    setError(null);
    onChange(files);
  }, [onChange]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesSelected(e.target.files);
  }, [handleFilesSelected]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    setError("Folder drag-and-drop not supported. Please click to select.");
  }, []);

  const handleClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleReset = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setError(null);
    onChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onChange]);

  return (
    <div className={cn("w-full", className)}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        aria-label="Select game build folder"
        webkitdirectory=""
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
            "border-cyber-purple/50 bg-transparent": !isDragging && !selectedFolderName,
            "border-green-500/50 bg-green-500/10": !isDragging && selectedFolderName && !error,
            "border-destructive/50 bg-destructive/10": error
          }
        )}
      >
        {error ? (
          <div className="py-4">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-2" />
            <p className="text-destructive font-medium">{error}</p>
            <Button 
              onClick={handleReset}
              variant="outline"
              className="mt-4 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              Try Again
            </Button>
          </div>
        ) : selectedFolderName ? (
          <div className="py-4">
            <Check className="mx-auto h-12 w-12 text-green-500 mb-2" />
            <p className="text-green-400 font-medium">Folder Selected: {selectedFolderName}</p>
            <p className="text-muted-foreground text-sm mt-1">
              ({selectedFileCount} files detected)
            </p>
            <Button 
              onClick={handleReset}
              variant="outline"
              className="mt-4 text-muted-foreground hover:text-white"
            >
              Change Folder
            </Button>
          </div>
        ) : (
          <div className="py-4">
            <FolderUp className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-white font-medium">
              Click to select your game build folder
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              (Drag & drop not supported for folders)
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
