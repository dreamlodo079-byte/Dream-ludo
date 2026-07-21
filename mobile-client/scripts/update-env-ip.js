const os = require('os');
const fs = require('fs');
const path = require('path');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  
  // Prioritize Wi-Fi interface if present
  const wifiInterface = interfaces['Wi-Fi'] || interfaces['Wireless LAN adapter Wi-Fi'];
  if (wifiInterface) {
    for (const details of wifiInterface) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }

  // Fallback to any active non-internal IPv4 address
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (const details of iface) {
      if (details.family === 'IPv4' && !details.internal && details.address !== '127.0.0.1') {
        return details.address;
      }
    }
  }
  return 'localhost';
}

try {
  const ip = getLocalIP();
  const envPath = path.join(__dirname, '../.env');
  const content = `EXPO_PUBLIC_SERVER_URL="http://${ip}:5000"\n`;
  
  fs.writeFileSync(envPath, content, 'utf8');
  console.log(`[IP Sync] Automatically updated EXPO_PUBLIC_SERVER_URL in .env to http://${ip}:5000`);
} catch (error) {
  console.error('[IP Sync] Failed to update local IP in .env:', error);
}
