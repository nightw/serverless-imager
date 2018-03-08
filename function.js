const Busboy = require('busboy');
const express = require("express");

const server = require('./server');

const app = express();
app.set("view engine", "pug");

// Creating a different file upload handler to make sure it works on Cloud Functions
const functionsUploadHandler = (
  req,
  res
) => {
  const busboy = new Busboy({ headers: req.headers });
  const uploadedImageInfo = {}

  // This callback will be invoked for each file uploaded
  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    console.log(`BusBoy got file in this field: [${fieldname}] filename: ${filename}, encoding: ${encoding}, mimetype: ${mimetype}`);
    uploadedImageInfo['filename'] = filename;
    uploadedImageInfo['buffer'] = [];

    file.on('data', function(data) {
      uploadedImageInfo['buffer'].push(data);
    });

    file.on('end', function() {
      uploadedImageInfo['buffer'] = Buffer.concat(uploadedImageInfo['buffer'])
    });
  });

  // This callback will be invoked after all uploaded files are saved.
  busboy.on('finish', () => {
    server.uploadHandler(
      res,
      uploadedImageInfo['filename'],
      uploadedImageInfo['buffer']
    );
  });

  // The raw bytes of the upload will be in req.rawBody. Send it to busboy, and get
  // a callback when it's finished.
  busboy.end(req.rawBody);
}

// This is required for the "root" URL to work on Cloud Functions
const slashFixFilterForApp = function (req, res, next) {
  if (!req.path) {
    res.redirect(`/${process.env.ENTRY_POINT}/${req.url}`) // redirect to the version with the slash
  }
  // Using the original code from server.js for the root and the /show_image URLs
  app.get("/", server.getImagesHandler);
  app.get("/show_image", server.showImageHandler);
  // And using the new POST handler for the '/' URL from above
  app.post("/", functionsUploadHandler);
  return app(req, res, next)
};

exports.serverless_imager = slashFixFilterForApp
