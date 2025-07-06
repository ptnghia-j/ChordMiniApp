import { FaExclamationTriangle } from 'react-icons/fa';

export function WarningBanner({
  title='Current service unavailable',
  message='Please use alternative services and wait while we resolve the issue.'
}) {
  return (
    <div className='w-full bg-yellow-50 dark:bg-gray-800 text-yellow-800 dark:text-orange-200 border border-yellow-400 dark:border-orange-500 rounded-lg p-4 m-4'>
      <div className='flex'>
        <div className='flex-shrink-0'>
          <FaExclamationTriangle className='h-5 w-5 text-yellow-600 dark:text-orange-400' aria-hidden='true'/>
        </div>
        <div className='ml-3'>
          <p className='text-sm font-medium text-yellow-800 dark:text-orange-200'>
            <span className="text-yellow-700 dark:text-orange-400">{title}:</span> {message}
          </p>
        </div>
      </div>
    </div>
  );

}