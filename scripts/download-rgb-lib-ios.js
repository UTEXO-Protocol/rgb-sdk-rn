const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const URL =
  'https://github.com/RGB-Tools/rgb-lib-swift/releases/download/0.3.0-beta.4/rgb_libFFI.xcframework.zip';
const IOS_DIR = path.join(__dirname, '..', 'ios');
const ZIP_FILE = path.join(IOS_DIR, 'rgb_libFFI.xcframework.zip');
const XCFRAMEWORK_DIR = path.join(IOS_DIR, 'rgb_libFFI.xcframework');

if (process.platform !== 'darwin') {
  console.log('Skipping iOS framework download: not running on macOS');
  process.exit(0);
}

if (fs.existsSync(XCFRAMEWORK_DIR)) {
  console.log('rgb_libFFI.xcframework already exists, skipping download');
  process.exit(0);
}

console.log('Downloading rgb_libFFI.xcframework...');

if (!fs.existsSync(IOS_DIR)) {
  fs.mkdirSync(IOS_DIR, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          return downloadFile(response.headers.location, dest)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Failed to download: ${response.statusCode} ${response.statusMessage}`
            )
          );
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
  });
}

function extractZip(zipPath, extractDir) {
  try {
    execSync(`unzip -q -o "${zipPath}" -d "${extractDir}"`, {
      stdio: 'inherit',
    });
  } catch (error) {
    throw new Error(`Failed to extract zip: ${error.message}`);
  }
}

(async () => {
  try {
    // Download the zip file
    await downloadFile(URL, ZIP_FILE);
    console.log('Download complete');

    // Extract the zip file
    console.log('Extracting rgb_libFFI.xcframework...');
    extractZip(ZIP_FILE, IOS_DIR);

    // Remove the zip file after extraction
    fs.unlinkSync(ZIP_FILE);
    console.log('Extraction complete');

    // Verify the xcframework exists
    if (fs.existsSync(XCFRAMEWORK_DIR)) {
      console.log(
        'rgb_libFFI.xcframework successfully downloaded and extracted'
      );
    } else {
      throw new Error('xcframework not found after extraction');
    }
  } catch (error) {
    console.error(
      'Error downloading or extracting rgb_libFFI.xcframework:',
      error.message
    );
    process.exit(1);
  }
})();
