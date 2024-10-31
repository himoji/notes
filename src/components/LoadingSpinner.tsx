import React from 'react';

export const LoadingSpinner: React.FC = () => (
    <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
    </div>
);