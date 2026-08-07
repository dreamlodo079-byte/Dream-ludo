const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

console.log('Starting EAS Build Watcher...');

function checkBuild() {
  try {
    const output = execSync('npx eas-cli build:list --limit 1 --status finished --json', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    const builds = JSON.parse(output);
    if (builds && builds.length > 0) {
      const build = builds[0];
      const buildTime = new Date(build.createdAt).getTime();
      const now = Date.now();
      // If the build was created within the last 30 minutes
      if (now - buildTime < 30 * 60 * 1000) {
        const apkUrl = build.artifacts.buildUrl;
        console.log('Found recent finished build:', apkUrl);
        
        const apkPath = path.join('g:', 'Ludo', 'backend', 'public', 'downloads', 'dream-ludo.apk');
        console.log('Downloading APK to', apkPath);
        
        const file = fs.createWriteStream(apkPath);
        https.get(apkUrl, function(response) {
          response.pipe(file);
          file.on('finish', function() {
            file.close();
            console.log('Download complete. Pushing to GitHub...');
            
            try {
              execSync('git add backend/public/downloads/dream-ludo.apk', { cwd: 'g:\\Ludo', stdio: 'inherit' });
              execSync('git commit -m "Deploy fresh production APK with native Firebase OTP support"', { cwd: 'g:\\Ludo', stdio: 'inherit' });
              execSync('git push origin main', { cwd: 'g:\\Ludo', stdio: 'inherit' });
              console.log('Successfully pushed to GitHub! DONE!');
              process.exit(0);
            } catch (err) {
              console.error('Git push failed:', err);
              process.exit(1);
            }
          });
        }).on('error', function(err) {
          fs.unlink(apkPath, () => {});
          console.error('Download error:', err);
        });
        
        return; // Don't schedule next check
      }
    }
  } catch (err) {
    // Ignore and retry
  }
  
  console.log('Build not finished yet. Checking again in 30 seconds...');
  setTimeout(checkBuild, 30000);
}

checkBuild();
