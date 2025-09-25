#!/usr/bin/env node

/**
 * Simple Appwrite YT-DLP Function Test
 * Tests basic function connectivity and error handling
 */

const { Client, Functions } = require('node-appwrite');

// Configuration
const APPWRITE_ENDPOINT = 'https://sfo.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '68d48e41000a72457eb6';
const APPWRITE_FUNCTION_ID = '68d49cd300092b56014f';

async function testBasicConnectivity() {
    console.log('🔧 Testing Basic Appwrite Function Connectivity');
    console.log('==============================================');
    
    try {
        // Initialize Appwrite client
        const client = new Client()
            .setEndpoint(APPWRITE_ENDPOINT)
            .setProject(APPWRITE_PROJECT_ID);

        const functions = new Functions(client);

        console.log('📡 Testing function with minimal payload...');
        
        // Test with minimal payload to check if function is working
        const result = await functions.createExecution(
            APPWRITE_FUNCTION_ID,
            JSON.stringify({
                method: 'GET',
                path: '/health'
            }),
            false, // async
            '/', // path
            'GET' // method
        );

        console.log('✅ Function execution initiated');
        console.log(`📋 Execution ID: ${result.$id}`);
        console.log(`📊 Status: ${result.status}`);
        console.log(`⏱️  Created: ${result.$createdAt}`);
        
        // Wait a moment for execution
        console.log('⏳ Waiting 5 seconds for execution...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Get execution result
        const execution = await functions.getExecution(APPWRITE_FUNCTION_ID, result.$id);
        
        console.log('\n📊 Execution Results:');
        console.log(`Status: ${execution.status}`);
        console.log(`Duration: ${execution.duration}ms`);
        console.log(`Response Code: ${execution.responseStatusCode}`);
        console.log(`Response Headers: ${JSON.stringify(execution.responseHeaders, null, 2)}`);
        console.log(`Response Body: ${execution.responseBody}`);
        
        if (execution.errors && execution.errors.length > 0) {
            console.log(`❌ Errors: ${execution.errors}`);
        }
        
        if (execution.logs && execution.logs.length > 0) {
            console.log(`📝 Logs: ${execution.logs}`);
        }
        
        return execution.status === 'completed';
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response);
        }
        return false;
    }
}

async function testYouTubeExtraction() {
    console.log('\n🎬 Testing YouTube Extraction');
    console.log('=============================');
    
    try {
        const client = new Client()
            .setEndpoint(APPWRITE_ENDPOINT)
            .setProject(APPWRITE_PROJECT_ID);

        const functions = new Functions(client);

        // Test with a simple YouTube URL
        const testUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
        console.log(`📹 Testing URL: ${testUrl}`);
        
        const result = await functions.createExecution(
            APPWRITE_FUNCTION_ID,
            JSON.stringify({
                url: testUrl,
                format: 'bestaudio'
            }),
            false,
            '/',
            'POST'
        );

        console.log('✅ Extraction execution initiated');
        console.log(`📋 Execution ID: ${result.$id}`);
        
        // Wait longer for extraction
        console.log('⏳ Waiting 30 seconds for extraction...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        const execution = await functions.getExecution(APPWRITE_FUNCTION_ID, result.$id);
        
        console.log('\n📊 Extraction Results:');
        console.log(`Status: ${execution.status}`);
        console.log(`Duration: ${execution.duration}ms`);
        console.log(`Response Code: ${execution.responseStatusCode}`);
        
        if (execution.responseBody) {
            try {
                const response = JSON.parse(execution.responseBody);
                console.log(`Success: ${response.success}`);
                if (response.error) {
                    console.log(`Error: ${response.error}`);
                }
                if (response.title) {
                    console.log(`Title: ${response.title}`);
                }
            } catch (e) {
                console.log(`Raw Response: ${execution.responseBody.substring(0, 500)}...`);
            }
        }
        
        if (execution.errors && execution.errors.length > 0) {
            console.log(`❌ Errors: ${execution.errors}`);
        }
        
        if (execution.logs && execution.logs.length > 0) {
            console.log(`📝 Logs: ${execution.logs}`);
        }
        
        return execution.status === 'completed' && execution.responseStatusCode === 200;
        
    } catch (error) {
        console.error('❌ Extraction test failed:', error.message);
        return false;
    }
}

async function main() {
    console.log('🧪 Appwrite YT-DLP Function Diagnostic Test');
    console.log('==========================================\n');
    
    const basicTest = await testBasicConnectivity();
    const extractionTest = await testYouTubeExtraction();
    
    console.log('\n📊 Test Summary');
    console.log('===============');
    console.log(`Basic Connectivity: ${basicTest ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`YouTube Extraction: ${extractionTest ? '✅ PASS' : '❌ FAIL'}`);
    
    if (!basicTest) {
        console.log('\n💡 Recommendations:');
        console.log('- Check if the function is properly deployed');
        console.log('- Verify function ID and project ID are correct');
        console.log('- Check Appwrite console for build errors');
    }
    
    if (basicTest && !extractionTest) {
        console.log('\n💡 Recommendations:');
        console.log('- Function is working but YouTube extraction is failing');
        console.log('- Check function logs for specific YouTube blocking errors');
        console.log('- Consider implementing additional bypass techniques');
    }
    
    console.log('\n🔗 Useful Links:');
    console.log(`📊 Appwrite Console: https://cloud.appwrite.io/console/project-${APPWRITE_PROJECT_ID}`);
    console.log(`📋 Function Dashboard: https://cloud.appwrite.io/console/project-${APPWRITE_PROJECT_ID}/functions/function-${APPWRITE_FUNCTION_ID}`);
}

if (require.main === module) {
    main().catch(console.error);
}
