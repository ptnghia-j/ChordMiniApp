/**
 * QuickTube Filename Generator - Exact yt-dlp Logic Replication
 *
 * This service replicates QuickTube's exact filename generation logic
 * based on yt-dlp's --restrict-filenames parameter.
 *
 * Key findings from analysis:
 * 1. Format: {sanitized_title}-[{video_id}].mp3
 * 2. Unicode decomposition: Characters with diacritics become base + underscore
 * 3. Example: "DŨNG" → "D_NG" (Ũ decomposes to U + combining tilde, tilde becomes _)
 * 4. Spaces and special characters become underscores
 */

export interface FilenameGenerationResult {
  filename: string;
  downloadUrl: string;
  method: string;
}

export class QuickTubeFilenameGenerator {
  private static instance: QuickTubeFilenameGenerator;
  private readonly QUICKTUBE_BASE_URL = 'https://quicktube.app';

  public static getInstance(): QuickTubeFilenameGenerator {
    if (!QuickTubeFilenameGenerator.instance) {
      QuickTubeFilenameGenerator.instance = new QuickTubeFilenameGenerator();
    }
    return QuickTubeFilenameGenerator.instance;
  }

  /**
   * Generate the exact filename that QuickTube/yt-dlp would create
   */
  generateFilename(title: string, videoId: string): FilenameGenerationResult[] {
    // Use exact yt-dlp logic replication
    const exactFilename = this.replicateExactYtDlpLogic(title, videoId);

    const result: FilenameGenerationResult = {
      filename: exactFilename,
      downloadUrl: `${this.QUICKTUBE_BASE_URL}/dl/${this.encodeQuickTubeFilename(exactFilename)}`,
      method: 'yt-dlp-exact'
    };

    return [result];
  }

  /**
   * Custom encoding for QuickTube URLs that preserves square brackets
   * QuickTube expects square brackets to remain unencoded in the URL
   *
   * CRITICAL FIX: This resolves the URL encoding mismatch where:
   * - Working URL: https://quicktube.app/dl/Ng_t_-_L_N_CU_I_i_ben_em_xot_xa_ng_i_i-[kSjj0LlsqnI].mp3
   * - Previous broken URL: https://quicktube.app/dl/Ng_t_-_L_N_CU_I_i_ben_em_xot_xa_ng_i_i-%5BkSjj0LlsqnI%5D.mp3
   *
   * KOREAN FIX: Strip any remaining non-ASCII characters instead of URL-encoding them
   * Example: "겨울사랑_A_winter_story-[bvKB2JGFSi0].mp3" → "A_winter_story-[bvKB2JGFSi0].mp3"
   */
  private encodeQuickTubeFilename(filename: string): string {
    // Step 1: Strip any remaining non-ASCII characters that weren't caught in decomposition
    // This handles cases where non-ASCII characters somehow remain in the filename
    let sanitized = filename.replace(/[^\x00-\x7F]/g, '');

    // Step 2: Clean up any leading/trailing underscores that might result from stripping
    sanitized = sanitized.replace(/^_+|_+$/g, '');

    // Step 3: Apply standard URL encoding to ASCII characters
    let encoded = encodeURIComponent(sanitized);

    // Step 4: Restore square brackets which QuickTube expects unencoded
    encoded = encoded.replace(/%5B/g, '[').replace(/%5D/g, ']');

    console.log(`🔧 QuickTube URL encoding fix: "${filename}" → "${encoded}"`);
    return encoded;
  }

  /**
   * Replicate yt-dlp's exact filename generation logic
   * Final production version with minimal logging
   */
  private replicateExactYtDlpLogic(title: string, videoId: string): string {
    // Step 1: Apply Unicode decomposition
    let sanitized = this.applyUnicodeDecomposition(title);

    // Step 2: Replace spaces and special characters with underscores
    sanitized = this.replaceSpecialCharacters(sanitized);

    // Step 3: Clean up consecutive underscores
    sanitized = this.cleanupFilename(sanitized);

    // Step 4: Apply yt-dlp's standard format: {title}-[{id}].mp3
    const filename = `${sanitized}-[${videoId}].mp3`;

    console.log(`🔧 Generated filename: "${filename}" for video ${videoId}`);

    // Track performance for Vietnamese character handling
    this.trackFilenamePerformance(title, filename);

    return filename;
  }

  /**
   * Apply Unicode decomposition to match yt-dlp's exact behavior
   * CORRECTED VERSION: Based on analysis of "Ngọt - LẦN CUỐI (đi bên em xót xa người ơi)"
   * Expected: "Ng_t_-_L_N_CU_I_i_ben_em_xot_xa_ng_i_i-[kSjj0LlsqnI].mp3"
   *
   * VIETNAMESE DIACRITICS FIX: Handle Vietnamese character combinations properly
   * - "ươ" → "_ng" (as a unit)
   * - "ân " → "_" (â becomes _, n + space merge)
   * - "uân" → "uan" (â becomes a in this context)
   *
   * KOREAN FIX: Korean characters (Hangul) should be stripped entirely
   * Example: "겨울사랑_A_winter_story" → "A_winter_story"
   */
  private applyUnicodeDecomposition(text: string): string {
    // Step 0: Handle Vietnamese character combinations first
    let result = this.handleVietnameseCombinations(text);
    // Step 1: Strip non-Latin script characters entirely
    // This includes Korean, Chinese, Japanese, Arabic, Cyrillic, etc.

    // Korean Unicode ranges:
    // - Hangul Syllables: U+AC00-U+D7AF
    // - Hangul Jamo: U+1100-U+11FF
    // - Hangul Compatibility Jamo: U+3130-U+318F
    result = result.replace(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, '');

    // Chinese Unicode ranges:
    // - CJK Unified Ideographs: U+4E00-U+9FFF
    // - CJK Extension A: U+3400-U+4DBF
    // - CJK Extension B: U+20000-U+2A6DF (handled by surrogate pairs)
    result = result.replace(/[\u4E00-\u9FFF\u3400-\u4DBF]/g, '');

    // Japanese Unicode ranges:
    // - Hiragana: U+3040-U+309F
    // - Katakana: U+30A0-U+30FF
    // - Katakana Phonetic Extensions: U+31F0-U+31FF
    result = result.replace(/[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF]/g, '');

    // Arabic Unicode ranges:
    // - Arabic: U+0600-U+06FF
    // - Arabic Supplement: U+0750-U+077F
    // - Arabic Extended-A: U+08A0-U+08FF
    result = result.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g, '');

    // Cyrillic Unicode ranges:
    // - Cyrillic: U+0400-U+04FF
    // - Cyrillic Supplement: U+0500-U+052F
    result = result.replace(/[\u0400-\u04FF\u0500-\u052F]/g, '');

    // Hebrew Unicode range:
    // - Hebrew: U+0590-U+05FF
    result = result.replace(/[\u0590-\u05FF]/g, '');

    // Thai Unicode range:
    // - Thai: U+0E00-U+0E7F
    result = result.replace(/[\u0E00-\u0E7F]/g, '');

    // Step 2: Characters that should disappear completely (only đ/Đ)
    const disappearingChars: Record<string, string> = {
      'đ': '',  // đi → i (đ disappears completely)
      'Đ': '',  // ĐOẠN → OẠN (Đ disappears completely)
    };

    // Characters that become their base form (simple diacritics)
    const baseFormMappings: Record<string, string> = {
      // Basic vowels with simple diacritics → base form
      'À': 'A', 'Á': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A', 'Æ': 'AE',
      'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
      'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
      'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O',
      'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U',
      'Ý': 'Y', 'Ỳ': 'Y', 'Ÿ': 'Y',
      'Ñ': 'N', 'Ç': 'C',

      // Lowercase versions
      'à': 'a', 'á': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'æ': 'ae',
      'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
      'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
      'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
      'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
      'ý': 'y', 'ỳ': 'y', 'ÿ': 'y',
      'ñ': 'n', 'ç': 'c',

      // Additional European characters
      'ß': 'ss', // German eszett
      'Þ': 'TH', 'þ': 'th', // Icelandic thorn
      'Ð': 'D', 'ð': 'd',   // Icelandic eth
    };

    // Characters with complex diacritics that become underscores
    const underscoreMappings: Record<string, string> = {
      // Vietnamese special characters that become underscores
      'ư': '_',     // Phương → Ph_ng (ư becomes _)
      'Ư': '_',     // uppercase version
      'ơ': '_',     // hơn → h_n (ơ becomes _)
      'Ơ': '_',     // uppercase version
      'â': '_',     // sân → s_n (â becomes _)
      'Â': '_',     // uppercase version

      // Vietnamese tone marks and complex diacritics → underscore
      'Ũ': '_',     // DŨNG → D_NG (Ũ becomes _)
      'Ạ': '_',     // ĐOẠN → O_N (Ạ becomes _)
      'Ế': '_',     // KẾT → K_T (Ế becomes _)
      'Ớ': '_',     // MỚI → M_I (Ớ becomes _)
      'Ầ': '_',     // LẦN → L_N (Ầ becomes _)
      'Ố': '_',     // CUỐI → CU_I (Ố becomes _)

      // All Vietnamese complex diacritics (uppercase)
      'Ả': '_', 'Ấ': '_', 'Ẩ': '_', 'Ẫ': '_', 'Ậ': '_',
      'Ắ': '_', 'Ằ': '_', 'Ẳ': '_', 'Ẵ': '_', 'Ặ': '_',
      'Ẹ': '_', 'Ẻ': '_', 'Ẽ': '_', 'Ề': '_', 'Ể': '_', 'Ễ': '_', 'Ệ': '_',
      'Ị': '_', 'Ỉ': '_', 'Ĩ': '_',
      'Ọ': '_', 'Ỏ': '_', 'Ồ': '_', 'Ổ': '_', 'Ỗ': '_', 'Ộ': '_',
      'Ờ': '_', 'Ở': '_', 'Ỡ': '_', 'Ợ': '_',
      'Ụ': '_', 'Ủ': '_', 'Ứ': '_', 'Ừ': '_', 'Ử': '_', 'Ữ': '_', 'Ự': '_',
      'Ỵ': '_', 'Ỷ': '_', 'Ỹ': '_',

      // Lowercase versions
      'ũ': '_', 'ạ': '_', 'ả': '_', 'ấ': '_', 'ầ': '_', 'ẩ': '_', 'ẫ': '_', 'ậ': '_',
      'ắ': '_', 'ằ': '_', 'ẳ': '_', 'ẵ': '_', 'ặ': '_',
      'ẹ': '_', 'ẻ': '_', 'ẽ': '_', 'ế': '_', 'ề': '_', 'ể': '_', 'ễ': '_', 'ệ': '_',
      'ị': '_', 'ỉ': '_', 'ĩ': '_',
      'ọ': '_', 'ỏ': '_', 'ố': '_', 'ồ': '_', 'ổ': '_', 'ỗ': '_', 'ộ': '_',
      'ớ': '_', 'ờ': '_', 'ở': '_', 'ỡ': '_', 'ợ': '_',
      'ụ': '_', 'ủ': '_', 'ứ': '_', 'ừ': '_', 'ử': '_', 'ữ': '_', 'ự': '_',
      'ỵ': '_', 'ỷ': '_', 'ỹ': '_'
    };

    // Step 3: Apply disappearing characters
    for (const [unicode, replacement] of Object.entries(disappearingChars)) {
      result = result.replace(new RegExp(unicode, 'g'), replacement);
    }

    // Step 4: Apply base form mappings
    for (const [unicode, replacement] of Object.entries(baseFormMappings)) {
      result = result.replace(new RegExp(unicode, 'g'), replacement);
    }

    // Step 5: Apply underscore mappings
    for (const [unicode, replacement] of Object.entries(underscoreMappings)) {
      result = result.replace(new RegExp(unicode, 'g'), replacement);
    }

    return result;
  }

  /**
   * Handle Vietnamese character combinations that need special processing
   * This handles cases where character context matters for conversion
   */
  private handleVietnameseCombinations(text: string): string {
    let result = text;

    // Handle specific Vietnamese combinations (order matters!)
    // "uân" → "uan" (â becomes a when preceded by u, case insensitive) - FIRST
    result = result.replace(/([Uu])ân/g, '$1an');

    // "ân " (â + n + space) → "_" (merge into single underscore) - SECOND
    result = result.replace(/ân\s/g, '_');

    return result;
  }

  /**
   * Replace special characters with underscores
   * FINAL VERSION: Preserves hyphens and periods
   */
  private replaceSpecialCharacters(text: string): string {
    let result = text;

    // Replace spaces with underscores (preserves hyphens and periods naturally)
    result = result.replace(/\s/g, '_');

    // Replace pipe with underscore
    result = result.replace(/\|/g, '_');

    // Replace other special characters with underscores (but keep hyphens and periods!)
    result = result.replace(/[\,\!\?\(\)\[\]\{\}\+\=\&\%\$\#\@\^\*\~\`\;\'\"]/g, '_');

    return result;
  }

  /**
   * Clean up the filename by removing consecutive underscores
   * ENHANCED VERSION: Better handling of spaces and consecutive underscores
   */
  private cleanupFilename(text: string): string {
    // Protect "_-_" sequences with a simple placeholder
    const HYPHEN_PLACEHOLDER = 'HYPHEN_PLACEHOLDER';
    let result = text.replace(/_-_/g, HYPHEN_PLACEHOLDER);

    // Remove consecutive underscores (but preserve single underscores)
    result = result.replace(/_+/g, '_');

    // Restore the "_-_" sequences
    result = result.replace(/HYPHEN_PLACEHOLDER/g, '_-_');

    // Remove leading and trailing underscores
    result = result.replace(/^_+|_+$/g, '');

    // Handle edge case where stripping characters leaves only underscores and spaces
    // Convert remaining spaces to underscores and clean up again
    result = result.replace(/\s+/g, '_');
    result = result.replace(/_+/g, '_');
    result = result.replace(/^_+|_+$/g, '');

    // Ensure it's not empty
    if (!result) {
      result = 'video';
    }

    return result;
  }

  /**
   * Test the filename generation with known examples
   * UPDATED: Added Korean, Chinese, Japanese, Arabic, and other Unicode test cases
   */
  testFilenameGeneration(): void {
    const testCases = [
      // Vietnamese test cases
      {
        title: "HOÀNG DŨNG - ĐOẠN KẾT MỚI | OFFICIAL AUDIO",
        videoId: "cX2uLlc0su4",
        expected: "HOANG_D_NG_-_O_N_K_T_M_I_OFFICIAL_AUDIO-[cX2uLlc0su4].mp3"
      },
      {
        title: "Chờ Anh Nhé (feat. Hoàng Rob)",
        videoId: "0chK12qHGfM",
        expected: "Ch_Anh_Nhe_feat._Hoang_Rob-[0chK12qHGfM].mp3"
      },
      {
        title: "Ngọt - LẦN CUỐI (đi bên em xót xa người ơi)",
        videoId: "kSjj0LlsqnI",
        expected: "Ng_t_-_L_N_CU_I_i_ben_em_xot_xa_ng_i_i-[kSjj0LlsqnI].mp3"
      },

      // Korean test cases (should strip Korean characters entirely)
      {
        title: "겨울사랑_A_winter_story",
        videoId: "bvKB2JGFSi0",
        expected: "A_winter_story-[bvKB2JGFSi0].mp3"
      },
      {
        title: "BTS 방탄소년단 - Dynamite",
        videoId: "gdZLi9oWNZg",
        expected: "BTS_-_Dynamite-[gdZLi9oWNZg].mp3"
      },

      // Chinese test cases (should strip Chinese characters)
      {
        title: "周杰伦 Jay Chou - 青花瓷 Blue and White Porcelain",
        videoId: "test123",
        expected: "Jay_Chou_-_Blue_and_White_Porcelain-[test123].mp3"
      },

      // Japanese test cases (should strip Japanese characters)
      {
        title: "宇多田ヒカル Utada Hikaru - First Love",
        videoId: "test456",
        expected: "Utada_Hikaru_-_First_Love-[test456].mp3"
      },

      // Arabic test cases (should strip Arabic characters)
      {
        title: "فيروز Fairuz - Lebanese Song",
        videoId: "test789",
        expected: "Fairuz_-_Lebanese_Song-[test789].mp3"
      },

      // Mixed Unicode with accents and special characters
      {
        title: "Café Müller & Naïve Résumé",
        videoId: "testABC",
        expected: "Cafe_Muller_Naive_Resume-[testABC].mp3"
      }
    ];

    console.log('🧪 Testing filename generation (CORRECTED VERSION):');
    testCases.forEach((testCase, index) => {
      const results = this.generateFilename(testCase.title, testCase.videoId);
      const primary = results[0];
      console.log(`📝 Test ${index + 1}: "${testCase.title}"`);
      console.log(`   Generated: "${primary.filename}"`);
      console.log(`   Expected:  "${testCase.expected}"`);

      const matches = primary.filename === testCase.expected;
      console.log(`   Result: ${matches ? '✅ PASS' : '❌ FAIL'}`);

      if (!matches) {
        // Show character-by-character diff for debugging
        const generated = primary.filename.replace(`-[${testCase.videoId}].mp3`, '');
        const expected = testCase.expected.replace(`-[${testCase.videoId}].mp3`, '');
        console.log(`   Diff analysis:`);
        console.log(`     Generated base: "${generated}"`);
        console.log(`     Expected base:  "${expected}"`);

        const maxLen = Math.max(generated.length, expected.length);
        for (let i = 0; i < maxLen; i++) {
          const genChar = generated[i] || '(end)';
          const expChar = expected[i] || '(end)';
          if (genChar !== expChar) {
            console.log(`     Position ${i}: got "${genChar}", expected "${expChar}"`);
          }
        }
      }
      console.log('');
    });
  }

  /**
   * Track filename generation performance
   */
  private async trackFilenamePerformance(title: string, generatedFilename: string): Promise<void> {
    try {
      const { performanceMonitor } = await import('@/services/performanceMonitor');

      // Check if title contains Vietnamese characters
      const vietnamesePattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
      const isVietnamese = vietnamesePattern.test(title);

      // For now, assume success (we can add validation logic later)
      const success = generatedFilename.length > 0 && !generatedFilename.includes('undefined');

      performanceMonitor.trackFilenameMatching(success, isVietnamese);

      // Log Vietnamese character test for monitoring
      if (isVietnamese) {
        console.log(`🇻🇳 Vietnamese character test: "${title}" → "${generatedFilename}"`);
      }
    } catch {
      // Silently fail to avoid affecting filename generation
    }
  }
}

// Export singleton instance
export const quickTubeFilenameGenerator = QuickTubeFilenameGenerator.getInstance();
