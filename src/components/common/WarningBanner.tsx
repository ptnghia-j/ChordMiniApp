import { FaExclamationTriangle } from 'react-icons/fa';

export function WarningBanner({
  title='Notice: Discontinuation of service starting Sep 2nd until further notice',
  message=`Due to budget limits, the transcription service for the online version of the app is unavailable starting Sep 2nd.
This affects all API services hosted on Google Cloud Run. However, recently transcribed songs will still be available for playback and previewing of the app’s available functionalities.
Please try recently transcribed songs below and if you are interested, please clone the repo and run it locally.
Alternative hosting options will be announced later. We apologize for any inconvenience.`,
}) {
  return (
    <div className='w-full bg-yellow-50 dark:bg-gray-800 text-yellow-800 dark:text-orange-200 border border-yellow-400 dark:border-orange-500 rounded-lg p-4'>
      <div className='flex'>
        <div className='flex-shrink-0 m-2'>
          <FaExclamationTriangle className='h-5 w-5 text-yellow-600 dark:text-orange-400' aria-hidden='true'/>
        </div>
        <div className='p-2'>
          <p className='text-sm font-medium text-yellow-800 dark:text-orange-200'>
            <span className="text-yellow-700 dark:text-orange-400">{title}:</span> 
            <br/>
            {message}
          </p>
        </div>
      </div>
    </div>
  );

}