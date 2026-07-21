const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/screens/GameScreen.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

// Update outputRange to start full and drain out to empty
code = code.replace(
  'outputRange: [perimeter + startPos, startPos],',
  'outputRange: [startPos, startPos + perimeter],'
);

fs.writeFileSync(filePath, code);
console.log('Successfully inverted timer bar direction to drain out');
