'use client';

import React from 'react';

/**
 * Critical CSS component that inlines essential styles for above-the-fold content
 * This reduces render-blocking CSS and improves First Contentful Paint (FCP)
 */
export const CriticalCSS: React.FC = () => {
  return (
    <style jsx>{`
      /* Critical CSS for above-the-fold content */
      
      /* Layout fundamentals */
      html, body {
        margin: 0;
        padding: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      
      /* Navigation critical styles */
      nav {
        position: sticky;
        top: 0;
        z-index: 50;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid #e5e7eb;
      }
      
      /* Hero section critical styles */
      .hero-section {
        min-height: 60vh;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      
      /* Typography critical styles */
      h1 {
        font-size: 2.5rem;
        font-weight: 700;
        line-height: 1.2;
        margin: 0 0 1rem 0;
        color: #1f2937;
      }
      
      h2 {
        font-size: 2rem;
        font-weight: 600;
        line-height: 1.3;
        margin: 0 0 0.75rem 0;
        color: #374151;
      }
      
      /* Button critical styles */
      .btn-primary {
        background: #1e40af;
        color: white;
        padding: 0.75rem 1.5rem;
        border-radius: 0.5rem;
        border: none;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s ease;
      }
      
      .btn-primary:hover {
        background: #1d4ed8;
      }
      
      /* Search container critical styles */
      .search-container {
        max-width: 600px;
        margin: 0 auto;
        padding: 1rem;
      }
      
      .search-input {
        width: 100%;
        padding: 0.75rem 1rem;
        border: 2px solid #d1d5db;
        border-radius: 0.5rem;
        font-size: 1rem;
        outline: none;
        transition: border-color 0.2s ease;
      }
      
      .search-input:focus {
        border-color: #1e40af;
        box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.1);
      }
      
      /* Grid layout critical styles */
      .grid {
        display: grid;
        gap: 1.5rem;
      }
      
      .grid-cols-1 {
        grid-template-columns: repeat(1, minmax(0, 1fr));
      }
      
      @media (min-width: 640px) {
        .sm\\:grid-cols-2 {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      
      @media (min-width: 768px) {
        .md\\:grid-cols-3 {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      
      /* Card critical styles */
      .card {
        background: white;
        border-radius: 0.75rem;
        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
        overflow: hidden;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      
      .card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }
      
      /* Loading states critical styles */
      .animate-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      
      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }
      
      /* Dark mode critical styles */
      @media (prefers-color-scheme: dark) {
        html {
          color-scheme: dark;
        }
        
        body {
          background: #111720;
          color: #f9fafb;
        }
        
        nav {
          background: rgba(17, 23, 32, 0.95);
          border-bottom-color: #374151;
        }
        
        h1, h2 {
          color: #f9fafb;
        }
        
        .card {
          background: #1e252e;
          border: 1px solid #374151;
        }
        
        .search-input {
          background: #1e252e;
          border-color: #374151;
          color: #f9fafb;
        }
        
        .search-input:focus {
          border-color: #3b82f6;
        }
      }
      
      /* Responsive utilities critical styles */
      .container {
        width: 100%;
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 1rem;
      }
      
      .flex {
        display: flex;
      }
      
      .items-center {
        align-items: center;
      }
      
      .justify-center {
        justify-content: center;
      }
      
      .justify-between {
        justify-content: space-between;
      }
      
      .text-center {
        text-align: center;
      }
      
      .relative {
        position: relative;
      }
      
      .absolute {
        position: absolute;
      }
      
      .inset-0 {
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
      }
      
      /* Hide non-critical content initially */
      .below-fold {
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      
      .below-fold.loaded {
        opacity: 1;
        transform: translateY(0);
      }
    `}</style>
  );
};

export default CriticalCSS;
