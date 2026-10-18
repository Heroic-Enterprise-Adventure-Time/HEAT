# The single-page application's routes. The Angular router owns paths such
# as /adventure/42; the bucket holds no such object. On every viewer request
# to the default behavior, this function rewrites a path whose last segment
# has no extension to /index.html, so a deep link and a reload serve the
# page and the router reads the path from the address bar.
#
# Chosen over CloudFront's custom error responses, the other common shape,
# because those apply to every behavior of the distribution: a 404 from the
# API would come back as the page with a 200. A function on the default
# behavior touches only the page's requests, and the API's status codes
# reach the browser untouched. CloudFront Functions run at every edge, cost
# nothing within the account's always-free allowance of two million
# invocations a month (decision 0018), and have no cold start.
resource "aws_cloudfront_function" "spa_routes" {
  name    = "${var.name_prefix}-spa-routes"
  comment = "${var.name_prefix}: serve the page for a path with no extension."
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/spa-routes.js")
}
