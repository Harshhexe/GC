const { GoogleGenAI } = require('@google/genai');
const client = new GoogleGenAI({apiKey: 'dummy'});
console.log("has interactions?", 'interactions' in client);
console.log("has models?", 'models' in client);
console.log(Object.keys(client));
