const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

// Images to convert to WebP
const imagesToConvert = [
  'chordMiniLogo.png',
  'chordMiniLogo-dark.png',
  'demo1.png',
  'demo1_dark.png',
  'demo2.png',
  'demo2_dark.png',
  'musicAI.png'
];

async function convertToWebP() {
  console.log('🖼️  Converting images to WebP format...');
  
  for (const imageName of imagesToConvert) {
    const inputPath = path.join(publicDir, imageName);
    const outputPath = path.join(publicDir, imageName.replace('.png', '.webp'));
    
    try {
      if (fs.existsSync(inputPath)) {
        await sharp(inputPath)
          .webp({ quality: 85, effort: 6 })
          .toFile(outputPath);
        
        console.log(`✅ Converted ${imageName} to WebP`);
      } else {
        console.log(`⚠️  ${imageName} not found, skipping...`);
      }
    } catch (error) {
      console.error(`❌ Error converting ${imageName}:`, error.message);
    }
  }
  
  console.log('🎉 Image conversion completed!');
}

convertToWebP().catch(console.error);
