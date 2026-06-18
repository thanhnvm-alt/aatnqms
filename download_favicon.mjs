import https from 'https';
import fs from 'fs';
import path from 'path';

const file = fs.createWriteStream("favicon.png");
https.get("https://drive.google.com/uc?export=download&id=1bDMxj465lBlBF0IJY7R-93MxkulDeMND", function(response) {
  if (response.statusCode === 302 || response.statusCode === 303) {
      https.get(response.headers.location, function(res) {
          res.pipe(file);
      });
  } else {
      response.pipe(file);
  }
});
