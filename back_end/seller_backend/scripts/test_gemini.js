const fs = require('fs');
const path = require('path');

// load .env if present
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([^=\s]+)=(.*)$/);
      if (m) {
        const k = m[1];
        let v = m[2] || '';
        v = v.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        process.env[k] = v;
      }
    });
  }
} catch (e) {
  // ignore
}

const { generateTags } = require('../src/utils/tagging');

async function run() {
  try {
    const sample = 'Men\'s black cotton t-shirt, round neck, short sleeve, casual summer wear, branded.';
    console.log('Sending to Gemini:', sample);
    const tags = await generateTags(sample);
    console.log('Tags:', Array.isArray(tags) ? JSON.stringify(tags, null, 2) : String(tags));
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
}

run();
