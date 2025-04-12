import 'react';

declare module 'react' {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    // Add webkitdirectory attribute to allow folder selection
    webkitdirectory?: string;
    // 'directory' is non-standard but sometimes used, optional
    // directory?: string; 
  }
}
