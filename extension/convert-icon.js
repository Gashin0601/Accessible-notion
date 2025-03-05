const sharp = require('sharp');

async function convertIcon() {
  try {
    await sharp('icons/icon.svg')
      .resize(128, 128)
      .toFile('icons/icon128.png');
    console.log('Icon converted successfully');
  } catch (error) {
    console.error('Error converting icon:', error);
  }
}

convertIcon(); 