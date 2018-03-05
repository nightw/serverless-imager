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
const bucket = gcs.bucket("serverless_imager");
const app = express();

const port = process.env.PORT || 8080;

const directoryPrefix = "serverless_imager";
const thumbFolderName = "thumbs";

app.set("view engine", "pug");

app.get("/", function(req, res) {
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
    });
});

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
        .getBuffer(mimeType, (_, buffer) => thumbnailImageStream.end(buffer))
    )
    .catch(err => {
      console.error(err);
      res.status(500).send("Error during thumbnail generation: " + err);
    });
};

app.post("/", multer.single("image"), function(req, res) {
  if (!req.file) {
    res.status(400).send("There was no uploaded file!");
    return;
  }

  const originalImageobjectName = directoryPrefix + "/" + req.file.originalname;
  const thumbnailImageobjectName =
    directoryPrefix + "/" + thumbFolderName + "/" + req.file.originalname;
  const mimeType =
    mime.lookup(req.file.originalname) || "application/octet-stream";
  const originalImageGCSObject = bucket.file(originalImageobjectName);
  const thumbnailImageGCSObject = bucket.file(thumbnailImageobjectName);

  const streamOptions = { metadata: { contentType: mimeType } };

  const thumbnailImageStream = thumbnailImageGCSObject.createWriteStream(
    streamOptions
  );
  const originalImageStream = originalImageGCSObject.createWriteStream(
    streamOptions
  );

  const errorHandler = message => err => {
    console.error(err);
    res.status(500).send(message + err);
  };

  originalImageStream.on(
    "error",
    errorHandler("Error during iamge upload generation: ")
  );
  thumbnailImageStream.on(
    "error",
    errorHandler("Error during thumbnail writing to GCS: ")
  );

  originalImageStream.on(
    "finish",
    originalImageStreamFinishHandler(
      req.file.buffer,
      res,
      originalImageobjectName,
      mimeType,
      thumbnailImageStream
    )
  );

  thumbnailImageStream.on("finish", () => {
    console.log(
      "Thumbnail generation succeeded with object name: " +
        thumbnailImageobjectName
    );
    res.set("Refresh", "0;url=/");
    res.sendStatus(201);
  });

  originalImageStream.end(req.file.buffer);
});

app.get("/show_image", function(req, res) {
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
    });
});

exports.app = app;

app.listen(port, () =>
  console.log("Serverless Imager app listening on port " + port + "!")
);
