/**
 * Determines whether to show the snow effect on the page.
 * Returns true if the song title contains winter-related keywords
 * or if the current date is between December 21st and March 20th.
 * 
 * @param songTitle Optional song title to check
 */
export const shouldShowSnowEffect = (songTitle?: string): boolean => {
  // Check title keywords: 'snow', 'snowflake', 'snowflakes', 'winter'
  if (songTitle) {
    const titleLower = songTitle.toLowerCase();
    const keywords = ['snow', 'snowflake', 'snowflakes', 'winter'];
    
    // Check if any keyword matches
    const hasWinterKeyword = keywords.some(keyword => titleLower.includes(keyword));
    if (hasWinterKeyword) {
      return true;
    }
  }

  // Check date range: December 21 to March 20 (inclusive)
  const now = new Date();
  const month = now.getMonth(); // 0 = Jan, 11 = Dec
  const date = now.getDate();

  // Dec 21 - Dec 31
  if (month === 11 && date >= 21) {
    return true;
  }
  
  // Jan 1 - Feb 28/29
  if (month === 0 || month === 1) {
    return true;
  }
  
  // Mar 1 - Mar 20
  if (month === 2 && date <= 20) {
    return true;
  }

  return false;
};
