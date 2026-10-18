// The single-page application's routes, on the default behavior's viewer
// request (function.tf). A path whose last segment has no extension is one
// of the router's, not an object in the bucket: serve the page and let the
// router read the path. Anything with an extension, a hashed script, a
// stylesheet, config.json, the favicon, passes through untouched.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
