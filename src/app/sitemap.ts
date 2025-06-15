import { MetadataRoute } from 'next';

/**
 * Get recent or popular video IDs for sitemap inclusion
 * This could be enhanced to fetch from your database/cache
 */
async function getRecentVideoIds(): Promise<string[]> {
  try {
    // For now, return some example video IDs
    // In production, you might want to fetch from your database
    // or cache the most recently analyzed or popular videos
    const exampleVideoIds = [
      'dQw4w9WgXcQ', // Rick Astley - Never Gonna Give You Up
      'Y2ge3KrdeWs', // Example video ID
      '_zU7r8ATFmg', // Another example
      'kf7Dss2gCe0', // Another example
      'nSDgHBxUbVQ', // Another example
    ];
    
    return exampleVideoIds;
  } catch (error) {
    console.error('Failed to fetch recent video IDs for sitemap:', error);
    return [];
  }
}

/**
 * Generate dynamic sitemap for ChordMini
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chordmini.com';
  const currentDate = new Date();
  
  // Static pages with high priority
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/settings`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/analyze`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/status`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/changelog`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
  ];

  // Get recent video IDs for dynamic pages
  const recentVideoIds = await getRecentVideoIds();
  
  // Generate dynamic analyze pages
  const analyzePages: MetadataRoute.Sitemap = recentVideoIds.map(videoId => ({
    url: `${baseUrl}/analyze/${videoId}`,
    lastModified: currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  // Generate dynamic lyrics pages
  const lyricsPages: MetadataRoute.Sitemap = recentVideoIds.map(videoId => ({
    url: `${baseUrl}/lyrics/${videoId}`,
    lastModified: currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Combine all pages
  return [
    ...staticPages,
    ...analyzePages,
    ...lyricsPages,
  ];
}
