const server = require('./server');

// This is required for the "root" URL to work on Cloud Functions
const slash_fix_filter_before_app = function (req, res, next) {
  if (!req.path) {
    res.redirect(`/${process.env.ENTRY_POINT}/${req.url}`) // redirect to the version with the slash
  }
  return server.app(req, res, next)
};

exports.serverless_imager = slash_fix_filter_before_app
