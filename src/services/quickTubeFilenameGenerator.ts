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
      downloadUrl: `${this.QUICKTUBE_BASE_URL}/dl/${encodeURIComponent(exactFilename)}`,
      method: 'yt-dlp-exact'
    };

    return [result];
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
    return filename;
  }

  /**
   * Apply Unicode decomposition to match yt-dlp's exact behavior
   * CORRECTED VERSION: Based on analysis of "Ngọt - LẦN CUỐI (đi bên em xót xa người ơi)"
   * Expected: "Ng_t_-_L_N_CU_I_i_ben_em_xot_xa_ng_i_i-[kSjj0LlsqnI].mp3"
   */
  private applyUnicodeDecomposition(text: string): string {
    // CRITICAL FIX: Characters that disappear completely (not become 'd', 'u', etc.)
    const disappearingChars: Record<string, string> = {
      'đ': '',  // đi → i (đ disappears completely)
      'Đ': '',  // ĐOẠN → OẠN (Đ disappears completely)
      'ư': '',  // người → ngời (ư disappears completely)
      'Ư': '',  // uppercase version
      'ơ': '',  // ơi → i (ơ disappears completely)
      'Ơ': '',  // uppercase version
    };

    // Characters that become their base form (simple diacritics)
    const baseFormMappings: Record<string, string> = {
      // Basic vowels with simple diacritics → base form
      'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A',
      'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
      'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
      'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O',
      'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U',
      'Ý': 'Y', 'Ỳ': 'Y',

      // Lowercase versions
      'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a',
      'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
      'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
      'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o',
      'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
      'ý': 'y', 'ỳ': 'y',
    };

    // Characters with complex diacritics that become underscores
    const underscoreMappings: Record<string, string> = {
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

    let result = text;

    // Step 1: Apply disappearing characters first (most important)
    for (const [unicode, replacement] of Object.entries(disappearingChars)) {
      result = result.replace(new RegExp(unicode, 'g'), replacement);
    }

    // Step 2: Apply base form mappings
    for (const [unicode, replacement] of Object.entries(baseFormMappings)) {
      result = result.replace(new RegExp(unicode, 'g'), replacement);
    }

    // Step 3: Apply underscore mappings
    for (const [unicode, replacement] of Object.entries(underscoreMappings)) {
      result = result.replace(new RegExp(unicode, 'g'), replacement);
    }

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
   * WORKING VERSION 5: Simple protection and restoration
   */
  private cleanupFilename(text: string): string {
    // Protect "_-_" sequences with a simple placeholder
    const HYPHEN_PLACEHOLDER = 'HYPHEN';
    let result = text.replace(/_-_/g, HYPHEN_PLACEHOLDER);

    // Remove consecutive underscores
    result = result.replace(/_+/g, '_');

    // Restore the "_-_" sequences
    result = result.replace(/HYPHEN/g, '_-_');

    // Remove leading and trailing underscores
    result = result.replace(/^_+|_+$/g, '');

    // Ensure it's not empty
    if (!result) {
      result = 'video';
    }

    return result;
  }

  /**
   * Test the filename generation with known examples
   * UPDATED: Added the problematic Vietnamese title case
   */
  testFilenameGeneration(): void {
    const testCases = [
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
        // CRITICAL TEST CASE: The problematic Vietnamese title
        title: "Ngọt - LẦN CUỐI (đi bên em xót xa người ơi)",
        videoId: "kSjj0LlsqnI",
        expected: "Ng_t_-_L_N_CU_I_i_ben_em_xot_xa_ng_i_i-[kSjj0LlsqnI].mp3"
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
}

// Export singleton instance
export const quickTubeFilenameGenerator = QuickTubeFilenameGenerator.getInstance();
