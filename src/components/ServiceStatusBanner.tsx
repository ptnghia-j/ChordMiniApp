'use client';

import { useState, useEffect } from 'react';
import { LuTriangle, LuCheck, LuX } from 'react-icons/lu';

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'outage';
  message?: string;
}

export default function ServiceStatusBanner() {
  const [services] = useState<ServiceStatus[]>([
    { name: 'YouTube Search', status: 'operational' },
    { name: 'Audio Extraction', status: 'outage', message: 'QuickTube service temporarily unavailable' },
    { name: 'Chord Recognition', status: 'operational' },
    { name: 'Lyrics Transcription', status: 'operational' }
  ]);

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show banner if any service has issues
    const hasIssues = services.some(service => service.status !== 'operational');
    setIsVisible(hasIssues);
  }, [services]);

  if (!isVisible) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <LuCheck className="w-4 h-4 text-green-500" />;
      case 'degraded':
        return <LuTriangle className="w-4 h-4 text-yellow-500" />;
      case 'outage':
        return <LuX className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const criticalIssues = services.filter(service => service.status === 'outage');

  return (
    <div className="border-b border-gray-200 bg-yellow-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <LuTriangle className="w-5 h-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  Service Status Update
                </p>
                {criticalIssues.length > 0 && (
                  <p className="text-xs text-yellow-700">
                    {criticalIssues[0].message || `${criticalIssues[0].name} is currently experiencing issues`}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {services.map((service) => (
                <div key={service.name} className="flex items-center space-x-1">
                  {getStatusIcon(service.status)}
                  <span className="text-xs text-gray-600">{service.name}</span>
                </div>
              ))}
              
              <button
                onClick={() => setIsVisible(false)}
                className="text-yellow-600 hover:text-yellow-800 text-sm font-medium"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
