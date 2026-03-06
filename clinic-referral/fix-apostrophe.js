const fs = require('fs');

// Read specialties.json
let content = fs.readFileSync('data/specialties.json', 'utf8');

// Replace regular apostrophe (') with smart quote (')  
// The smart quote is Unicode U+2019 (UTF-8: E2 80 99)
content = content.replace(/women's-health/g, 'women\u2019s-health');

// Write back
fs.writeFileSync('data/specialties.json', content);

console.log('✅ Fixed: Replaced regular apostrophe with smart quote in women\'s-health');
