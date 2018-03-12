const gcs = require("@google-cloud/storage")();
const express = require("express");
const Multer = require("multer");
const mime = require("mime-types");
const Jimp = require("jimp");

const multer = Multer({
  storage: Multer.MemoryStorage,
  limits: {
    fileSize: 8 * 1024 * 1024 // no larger than 8 MB
  }
});

try {
  require('./config.json');
} catch (_) {
  console.error("ERROR: 'config.json' could not be loaded. Maybe it does not exist?");
  process.exit(1);
}

const config = require('./config.json');

if (config.bucket == null) {
  console.error("ERROR: 'config.json' file misses the key 'bucket'!");
  process.exit(2);
}

const bucket = gcs.bucket(config.bucket);

bucket.exists(function(err, exists) {
  if (err) {
    console.error("ERROR: Bucket " + config.bucket + " cannot be read!");
    process.exit(3);
  }
  if (!exists) {
    console.error("ERROR: Bucket " + config.bucket + " does not exist!");
    process.exit(4);
  }
});

const app = express();

const port = process.env.PORT || 8080;

const directoryPrefix = config.directoryPrefix;
const thumbFolderName = config.thumbFolderName;

app.set("view engine", "pug");

const originalImageStreamFinishHandler = (
  buffer,
  res,
  originalImageobjectName,
  mimeType,
  thumbnailImageStream
) => () => {
  console.log(
    "File upload succeeded with object name: " + originalImageobjectName
  );
  Jimp.read(buffer)
    .then(image =>
      image
        .scaleToFit(200, 200) // resize, so the longer side will be 200px
        .quality(70) // set JPEG quality
        .getBuffer(mimeType, (err, buffer) => {
          if (err) {
            throw new Error(err);
          }
          thumbnailImageStream.end(buffer)
        })
    )
    .catch(err => {
      console.error(err);
      res.status(500).send("Error during thumbnail generation: " + err);
    });
};

const thumbnailImageStreamFinishHandler = (
  res,
  thumbnailImageobjectName
) => () => {
  console.log("Thumbnail generation succeeded with object name: " + thumbnailImageobjectName);
  res.set("Refresh", "0");
  res.sendStatus(201);
}

const streamCreatorForGCSObject = (
  bucket,
  objectName,
  streamOptions,
  errorHandler
) => {
  const stream = bucket.file(objectName).createWriteStream(streamOptions);
  stream.on("error", errorHandler);
  return stream;
};

const errorHandler = message => err => {
  console.error(err);
  res.status(500).send(message + err);
};

const uploadHandler = (
  res,
  originalFileName,
  originalFileBuffer
) => {
  const originalImageobjectName = directoryPrefix + "/" + originalFileName;
  const thumbnailImageobjectName =
    directoryPrefix + "/" + thumbFolderName + "/" + originalFileName;
  const mimeType =
    mime.lookup(originalFileName) || "application/octet-stream";
  const streamOptions = { metadata: { contentType: mimeType } };

  const thumbnailImageStream = streamCreatorForGCSObject(
    bucket,
    thumbnailImageobjectName,
    streamOptions,
    errorHandler("Error during thumbnail writing to GCS: ")
  );
  const originalImageStream = streamCreatorForGCSObject(
    bucket,
    originalImageobjectName,
    streamOptions,
    errorHandler("Error during image upload generation: ")
  );

  originalImageStream.on(
    "finish",
    originalImageStreamFinishHandler(
      originalFileBuffer,
      res,
      originalImageobjectName,
      mimeType,
      thumbnailImageStream
    )
  );

  thumbnailImageStream.on(
    "finish",
    thumbnailImageStreamFinishHandler(res, thumbnailImageobjectName)
  );

  originalImageStream.end(originalFileBuffer);
}

const getImagesHandler = (req, res) => {
  const fileList = [];
  const prefix = directoryPrefix + "/" + thumbFolderName + "/";
  bucket.getFiles({ prefix, delimiter: "/" })
    .then(results => {
      const files = results[0];

      files.forEach(file => {
        if (file.name != prefix) {
          let baseFilename = file.name.replace(new RegExp("^" + prefix.replace("/", "/")), "");
          const fileDisplayName = baseFilename.length > 24
              ? baseFilename.substring(0, 24) + "..."
              : baseFilename;
          fileList.push({
            thumbUrl: "show_image?name=" + thumbFolderName + "/" + baseFilename,
            url: "show_image?name=" + baseFilename,
            fileName: fileDisplayName
          });
        }
      });
      console.log("Got an image list with the following length: " + fileList.length);
    })
    .then(() => {
      console.log("Rendering file list ...");
      res.render("index", { images: fileList });
    })
    .catch(err => {
      console.error("ERROR: ", err);
      res.status(500).send(message + err);
    });
}

const postImageHandler = (req, res) => {
  if (!req.file) {
    res.status(400).send("There was no uploaded file!");
    return;
  }

  uploadHandler(
    res,
    req.file.originalname,
    req.file.buffer
  );
}

const showImageHandler = (req, res) => {
  bucket
    .file("/" + directoryPrefix + "/" + req.query.name)
    .exists()
    .then(data => {
      let exists = data[0];
      let fullPath = "/" + directoryPrefix + "/" + req.query.name;
      if (exists) {
        console.log("Showing the following image from GCS: " + fullPath);
        res.setHeader(
          "Content-Type",
          mime.lookup(req.query.name) || "application/octet-stream"
        );
        bucket
          .file(fullPath)
          .createReadStream()
          .pipe(res);
      } else {
        console.log("The following file does not exit on GCS: " + fullPath);
        res.status(404).send("Image not found!");
      }
    })
    .catch(err => {
      console.error("ERROR: ", err);
      res.status(500).send(message + err);
    });
}

app.get("/", getImagesHandler);
app.get("/show_image", showImageHandler);
app.post("/", multer.single("image"), postImageHandler);

exports.getImagesHandler = getImagesHandler;
exports.showImageHandler = showImageHandler;
exports.uploadHandler = uploadHandler;

app.listen(port, () =>
  console.log("Serverless Imager app listening on port " + port + "!")
);
