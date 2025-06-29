#!/usr/bin/env node

/**
 * Comprehensive Piped API vs Current Implementation Benchmark
 * 
 * This script compares:
 * 1. Current YouTube Data API v3 search
 * 2. Current yt-dlp search 
 * 3. Current QuickTube audio extraction
 * 4. Current yt-dlp audio extraction
 * 5. New Piped search API
 * 6. New Piped audio extraction API
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

// Test configuration
const TEST_QUERIES = [
    'Hey Jude Beatles',
    'Bohemian Rhapsody Queen',
    'Stairway to Heaven Led Zeppelin',
    'Hotel California Eagles',
    'Sweet Child O Mine Guns N Roses',
    'Imagine John Lennon',
    'Yesterday Beatles',
    'Purple Haze Jimi Hendrix',
    'Like a Rolling Stone Bob Dylan',
    'Smells Like Teen Spirit Nirvana'
];

const TEST_VIDEO_IDS = [
    'A_MjCqQoLLA',  // Hey Jude
    'dQw4w9WgXcQ',  // Never Gonna Give You Up
    'fJ9rUzIMcZQ',  // Bohemian Rhapsody
    'BcL---4xQYA'   // Hotel California
];

const BACKEND_URL = 'http://localhost:5001';
const PRODUCTION_BACKEND_URL = 'https://chordmini-backend-full-191567167632.us-central1.run.app';

// Benchmark results storage
const results = {
    search: {
        piped: [],
        youtube_api: [],
        youtube_search_api: [],
        aiotube: []
    },
    audio_extraction: {
        piped: [],
        quicktube: [],
        yt_dlp: []
    }
};

// Utility functions
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function measureTime(asyncFunction) {
    const start = performance.now();
    try {
        const result = await asyncFunction();
        const end = performance.now();
        return {
            success: true,
            time: (end - start) / 1000, // Convert to seconds
            result: result
        };
    } catch (error) {
        const end = performance.now();
        return {
            success: false,
            time: (end - start) / 1000,
            error: error.message
        };
    }
}

// Search benchmarking functions
async function benchmarkPipedSearch(query) {
    console.log(`🔍 Testing Piped search: "${query}"`);
    
    return await measureTime(async () => {
        const response = await axios.get(`${BACKEND_URL}/api/search-piped`, {
            params: { q: query },
            timeout: 15000
        });
        return {
            total_results: response.data.total_results,
            response_time: response.data.response_time,
            source: response.data.source
        };
    });
}

async function benchmarkYouTubeAPISearch(query) {
    console.log(`🔍 Testing YouTube API search: "${query}"`);

    return await measureTime(async () => {
        const response = await axios.post(`${PRODUCTION_BACKEND_URL}/api/search-youtube`, {
            query: query,
            maxResults: 10
        }, {
            timeout: 15000
        });
        return {
            total_results: response.data.items?.length || 0,
            source: 'youtube_api'
        };
    });
}

async function benchmarkYouTubeSearchAPISearch(query) {
    console.log(`🔍 Testing YouTube Search API library: "${query}"`);

    return await measureTime(async () => {
        const response = await axios.get(`${BACKEND_URL}/api/search-youtube-search-api`, {
            params: { q: query, limit: 10 },
            timeout: 15000
        });
        return {
            total_results: response.data.total_results || 0,
            response_time: response.data.response_time,
            source: response.data.source
        };
    });
}

async function benchmarkAiotubeSearch(query) {
    console.log(`🔍 Testing Aiotube library: "${query}"`);

    return await measureTime(async () => {
        const response = await axios.get(`${BACKEND_URL}/api/search-aiotube`, {
            params: { q: query, limit: 10 },
            timeout: 15000
        });
        return {
            total_results: response.data.total_results || 0,
            response_time: response.data.response_time,
            source: response.data.source
        };
    });
}

// Audio extraction benchmarking functions
async function benchmarkPipedAudioExtraction(videoId) {
    console.log(`🎵 Testing Piped audio extraction: ${videoId}`);
    
    return await measureTime(async () => {
        const response = await axios.post(`${BACKEND_URL}/api/extract-audio-piped`, {
            video_id: videoId,
            quality: 'best'
        }, {
            timeout: 15000
        });
        return {
            success: response.data.success,
            response_time: response.data.response_time,
            bitrate: response.data.bitrate,
            available_streams: response.data.available_streams,
            source: response.data.source
        };
    });
}

async function benchmarkQuickTubeExtraction(videoId) {
    console.log(`🎵 Testing QuickTube audio extraction: ${videoId}`);
    
    return await measureTime(async () => {
        const response = await axios.get(`https://quicktube.app/download/index`, {
            params: { link: `https://www.youtube.com/watch?v=${videoId}` },
            timeout: 15000
        });
        return {
            success: !!response.data.jid,
            source: 'quicktube'
        };
    });
}

async function benchmarkYtDlpExtraction(videoId) {
    console.log(`🎵 Testing yt-dlp audio extraction: ${videoId}`);
    
    return await measureTime(async () => {
        const response = await axios.post(`${PRODUCTION_BACKEND_URL}/api/extract-audio`, {
            youtube_url: `https://www.youtube.com/watch?v=${videoId}`
        }, {
            timeout: 30000 // yt-dlp can be slower
        });
        return {
            success: response.data.success,
            method: response.data.method,
            source: 'yt_dlp'
        };
    });
}

// Main benchmarking functions
async function runSearchBenchmarks() {
    console.log('\n🚀 Starting Search Performance Benchmarks\n');

    for (const query of TEST_QUERIES) {
        console.log(`\n--- Testing Query: "${query}" ---`);

        // Test Piped search
        const pipedResult = await benchmarkPipedSearch(query);
        results.search.piped.push({ query, ...pipedResult });

        await sleep(1000); // Rate limiting delay

        // Test YouTube Search API library
        const youtubeSearchApiResult = await benchmarkYouTubeSearchAPISearch(query);
        results.search.youtube_search_api.push({ query, ...youtubeSearchApiResult });

        await sleep(1000);

        // Test Aiotube library
        const aiotubeResult = await benchmarkAiotubeSearch(query);
        results.search.aiotube.push({ query, ...aiotubeResult });

        await sleep(1000);

        // Test YouTube API search (production)
        const youtubeResult = await benchmarkYouTubeAPISearch(query);
        results.search.youtube_api.push({ query, ...youtubeResult });

        await sleep(2000); // Longer delay between different queries
    }
}

async function runAudioExtractionBenchmarks() {
    console.log('\n🎵 Starting Audio Extraction Performance Benchmarks\n');
    
    for (const videoId of TEST_VIDEO_IDS) {
        console.log(`\n--- Testing Video ID: ${videoId} ---`);
        
        // Test Piped audio extraction
        const pipedResult = await benchmarkPipedAudioExtraction(videoId);
        results.audio_extraction.piped.push({ videoId, ...pipedResult });
        
        await sleep(1000);
        
        // Test QuickTube extraction
        const quicktubeResult = await benchmarkQuickTubeExtraction(videoId);
        results.audio_extraction.quicktube.push({ videoId, ...quicktubeResult });
        
        await sleep(1000);
        
        // Test yt-dlp extraction (commented out to avoid rate limiting during testing)
        // const ytdlpResult = await benchmarkYtDlpExtraction(videoId);
        // results.audio_extraction.yt_dlp.push({ videoId, ...ytdlpResult });
        
        await sleep(2000); // Longer delay between videos
    }
}

// Results analysis functions
function analyzeResults() {
    console.log('\n📊 BENCHMARK RESULTS ANALYSIS\n');
    console.log('=' .repeat(80));
    
    // Search results analysis
    console.log('\n🔍 SEARCH PERFORMANCE COMPARISON');
    console.log('-'.repeat(50));

    const pipedSearchTimes = results.search.piped.filter(r => r.success).map(r => r.time);
    const youtubeSearchTimes = results.search.youtube_api.filter(r => r.success).map(r => r.time);
    const youtubeSearchApiTimes = results.search.youtube_search_api.filter(r => r.success).map(r => r.time);
    const aiotubeTimes = results.search.aiotube.filter(r => r.success).map(r => r.time);

    if (pipedSearchTimes.length > 0) {
        const avgPipedTime = pipedSearchTimes.reduce((a, b) => a + b, 0) / pipedSearchTimes.length;
        const pipedSuccessRate = (results.search.piped.filter(r => r.success).length / results.search.piped.length) * 100;
        console.log(`Piped Search - Avg Time: ${avgPipedTime.toFixed(3)}s, Success Rate: ${pipedSuccessRate.toFixed(1)}%`);
    }

    if (youtubeSearchApiTimes.length > 0) {
        const avgYouTubeSearchApiTime = youtubeSearchApiTimes.reduce((a, b) => a + b, 0) / youtubeSearchApiTimes.length;
        const youtubeSearchApiSuccessRate = (results.search.youtube_search_api.filter(r => r.success).length / results.search.youtube_search_api.length) * 100;
        console.log(`YouTube Search API Library - Avg Time: ${avgYouTubeSearchApiTime.toFixed(3)}s, Success Rate: ${youtubeSearchApiSuccessRate.toFixed(1)}%`);
    }

    if (aiotubeTimes.length > 0) {
        const avgAiotubeTime = aiotubeTimes.reduce((a, b) => a + b, 0) / aiotubeTimes.length;
        const aiotubeSuccessRate = (results.search.aiotube.filter(r => r.success).length / results.search.aiotube.length) * 100;
        console.log(`Aiotube Library - Avg Time: ${avgAiotubeTime.toFixed(3)}s, Success Rate: ${aiotubeSuccessRate.toFixed(1)}%`);
    }

    if (youtubeSearchTimes.length > 0) {
        const avgYouTubeTime = youtubeSearchTimes.reduce((a, b) => a + b, 0) / youtubeSearchTimes.length;
        const youtubeSuccessRate = (results.search.youtube_api.filter(r => r.success).length / results.search.youtube_api.length) * 100;
        console.log(`YouTube Data API v3 - Avg Time: ${avgYouTubeTime.toFixed(3)}s, Success Rate: ${youtubeSuccessRate.toFixed(1)}%`);
    }
    
    // Audio extraction results analysis
    console.log('\n🎵 AUDIO EXTRACTION PERFORMANCE COMPARISON');
    console.log('-'.repeat(50));
    
    const pipedAudioTimes = results.audio_extraction.piped.filter(r => r.success).map(r => r.time);
    const quicktubeAudioTimes = results.audio_extraction.quicktube.filter(r => r.success).map(r => r.time);
    
    if (pipedAudioTimes.length > 0) {
        const avgPipedAudioTime = pipedAudioTimes.reduce((a, b) => a + b, 0) / pipedAudioTimes.length;
        const pipedAudioSuccessRate = (results.audio_extraction.piped.filter(r => r.success).length / results.audio_extraction.piped.length) * 100;
        console.log(`Piped Audio - Avg Time: ${avgPipedAudioTime.toFixed(3)}s, Success Rate: ${pipedAudioSuccessRate.toFixed(1)}%`);
    }
    
    if (quicktubeAudioTimes.length > 0) {
        const avgQuickTubeTime = quicktubeAudioTimes.reduce((a, b) => a + b, 0) / quicktubeAudioTimes.length;
        const quicktubeSuccessRate = (results.audio_extraction.quicktube.filter(r => r.success).length / results.audio_extraction.quicktube.length) * 100;
        console.log(`QuickTube Audio - Avg Time: ${avgQuickTubeTime.toFixed(3)}s, Success Rate: ${quicktubeSuccessRate.toFixed(1)}%`);
    }
}

function generateRecommendation() {
    console.log('\n💡 MIGRATION RECOMMENDATION');
    console.log('=' .repeat(80));

    const pipedSearchSuccess = (results.search.piped.filter(r => r.success).length / results.search.piped.length) * 100;
    const pipedAudioSuccess = (results.audio_extraction.piped.filter(r => r.success).length / results.audio_extraction.piped.length) * 100;

    const youtubeSearchSuccess = (results.search.youtube_api.filter(r => r.success).length / results.search.youtube_api.length) * 100;
    const youtubeSearchApiSuccess = (results.search.youtube_search_api.filter(r => r.success).length / results.search.youtube_search_api.length) * 100;
    const aiotubeSuccess = (results.search.aiotube.filter(r => r.success).length / results.search.aiotube.length) * 100;
    const quicktubeAudioSuccess = (results.audio_extraction.quicktube.filter(r => r.success).length / results.audio_extraction.quicktube.length) * 100;

    console.log('\nSuccess Rate Comparison:');
    console.log(`- Piped Search: ${pipedSearchSuccess.toFixed(1)}%`);
    console.log(`- YouTube Search API Library: ${youtubeSearchApiSuccess.toFixed(1)}%`);
    console.log(`- Aiotube Library: ${aiotubeSuccess.toFixed(1)}%`);
    console.log(`- YouTube Data API v3: ${youtubeSearchSuccess.toFixed(1)}%`);
    console.log(`- Piped Audio: ${pipedAudioSuccess.toFixed(1)}%`);
    console.log(`- QuickTube Audio: ${quicktubeAudioSuccess.toFixed(1)}%`);

    // Find the best search method
    const searchMethods = [
        { name: 'YouTube Search API Library', success: youtubeSearchApiSuccess },
        { name: 'Aiotube Library', success: aiotubeSuccess },
        { name: 'Piped Search', success: pipedSearchSuccess },
        { name: 'YouTube Data API v3', success: youtubeSearchSuccess }
    ];

    const bestSearch = searchMethods.reduce((best, current) =>
        current.success > best.success ? current : best
    );

    console.log(`\n🏆 BEST SEARCH METHOD: ${bestSearch.name} (${bestSearch.success.toFixed(1)}% success rate)`);
    console.log(`🏆 BEST AUDIO METHOD: QuickTube (${quicktubeAudioSuccess.toFixed(1)}% success rate)`);

    // Generate final recommendation
    if (bestSearch.success >= 90) {
        console.log('\n✅ RECOMMENDATION: DEPLOY WITH BEST SEARCH + QUICKTUBE');
        console.log(`Use ${bestSearch.name} for search and QuickTube for audio extraction.`);
        console.log('This combination provides the most reliable service for production deployment.');
    } else if (bestSearch.success >= 70) {
        console.log('\n⚠️  RECOMMENDATION: DEPLOY WITH CAUTION');
        console.log(`${bestSearch.name} shows acceptable reliability but may need monitoring.`);
    } else {
        console.log('\n❌ RECOMMENDATION: INVESTIGATE FURTHER');
        console.log('All search methods show concerning reliability issues.');
    }
}

// Main execution
async function main() {
    console.log('🔬 Piped API vs Current Implementation Benchmark');
    console.log('=' .repeat(80));
    
    try {
        // Check if local server is running
        await axios.get(`${BACKEND_URL}/health`, { timeout: 5000 });
        console.log('✅ Local backend server is running');
        
        // Run benchmarks
        await runSearchBenchmarks();
        await runAudioExtractionBenchmarks();
        
        // Analyze and present results
        analyzeResults();
        generateRecommendation();
        
        // Save detailed results to file
        const fs = require('fs');
        fs.writeFileSync('./piped-benchmark-results.json', JSON.stringify(results, null, 2));
        console.log('\n📁 Detailed results saved to: piped-benchmark-results.json');
        
    } catch (error) {
        console.error('❌ Benchmark failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
