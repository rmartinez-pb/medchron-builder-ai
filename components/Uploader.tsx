
import React, { useRef } from 'react';

interface UploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export const Uploader: React.FC<UploaderProps> = ({ onFilesSelected, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
      if (inputRef.current) {
        inputRef.current.value = ''; // Reset input
      }
    }
  };

  return (
    <div className="p-4 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors text-center">
      <input
        type="file"
        multiple
        accept="application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
        onChange={handleFileChange}
        className="hidden"
        id="file-upload"
        ref={inputRef}
        disabled={disabled}
      />
      <label 
        htmlFor="file-upload" 
        className={`cursor-pointer flex flex-col items-center justify-center space-y-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="bg-blue-100 p-3 rounded-full">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div className="text-sm text-slate-600">
          <span className="font-semibold text-blue-600 hover:text-blue-700">Click to upload</span> or drag and drop
        </div>
        <p className="text-xs text-slate-500">PDF, DOCX, PNG, JPG (MAX. 10MB)</p>
      </label>
    </div>
  );
};
