#!/usr/bin/env node

/**
 * Node.js wrapper for youtube-search-api
 * This script provides a command-line interface to the youtube-search-api library
 * that can be called from Python
 */

const youtubesearchapi = require("youtube-search-api");

async function searchVideos(query, limit = 10) {
    try {
        const result = await youtubesearchapi.GetListByKeyword(query, false, limit, [{type: "video"}]);
        
        // Transform the result to match our expected format
        const transformedItems = result.items.map(item => ({
            videoId: item.id,
            title: item.title,
            channelTitle: item.channelTitle || '',
            channelId: item.channelId || '',
            duration: item.length?.simpleText || '',
            viewCount: 0, // Not available in this API
            publishedAt: '', // Not available in this API
            thumbnails: {
                default: { url: item.thumbnail?.thumbnails?.[0]?.url || '' },
                medium: { url: item.thumbnail?.thumbnails?.[1]?.url || item.thumbnail?.thumbnails?.[0]?.url || '' },
                high: { url: item.thumbnail?.thumbnails?.[2]?.url || item.thumbnail?.thumbnails?.[1]?.url || item.thumbnail?.thumbnails?.[0]?.url || '' }
            },
            isLive: item.isLive || false
        }));

        return {
            success: true,
            items: transformedItems,
            total_results: transformedItems.length,
            source: 'youtube-search-api',
            nextPageToken: result.nextPage?.nextPageToken || null
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            source: 'youtube-search-api'
        };
    }
}

async function getVideoDetails(videoId) {
    try {
        const result = await youtubesearchapi.GetVideoDetails(videoId);
        
        return {
            success: true,
            id: result.id,
            title: result.title,
            channel: result.channel,
            channelId: result.channelId,
            description: result.description,
            keywords: result.keywords || [],
            isLive: result.isLive || false,
            thumbnail: result.thumbnail,
            source: 'youtube-search-api'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            source: 'youtube-search-api'
        };
    }
}

async function getSuggestions(limit = 10) {
    try {
        const result = await youtubesearchapi.GetSuggestData(limit);
        
        const transformedItems = result.items.map(item => ({
            videoId: item.id,
            title: item.title,
            channelTitle: item.channelTitle || '',
            thumbnails: {
                default: { url: item.thumbnail?.thumbnails?.[0]?.url || '' }
            },
            isLive: item.isLive || false
        }));

        return {
            success: true,
            items: transformedItems,
            total_results: transformedItems.length,
            source: 'youtube-search-api'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            source: 'youtube-search-api'
        };
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: node youtube_search_wrapper.js <command> [args...]');
        console.error('Commands:');
        console.error('  search <query> [limit]     - Search for videos');
        console.error('  details <videoId>          - Get video details');
        console.error('  suggestions [limit]        - Get suggested videos');
        process.exit(1);
    }

    const command = args[0];
    let result;

    try {
        switch (command) {
            case 'search':
                if (args.length < 2) {
                    throw new Error('Search query is required');
                }
                const query = args[1];
                const limit = parseInt(args[2]) || 10;
                result = await searchVideos(query, limit);
                break;

            case 'details':
                if (args.length < 2) {
                    throw new Error('Video ID is required');
                }
                const videoId = args[1];
                result = await getVideoDetails(videoId);
                break;

            case 'suggestions':
                const suggestLimit = parseInt(args[1]) || 10;
                result = await getSuggestions(suggestLimit);
                break;

            default:
                throw new Error(`Unknown command: ${command}`);
        }

        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.log(JSON.stringify({
            success: false,
            error: error.message,
            source: 'youtube-search-api'
        }, null, 2));
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    searchVideos,
    getVideoDetails,
    getSuggestions
};
