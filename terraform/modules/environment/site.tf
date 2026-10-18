# The environment's site: its hostname, the client bucket and the CloudFront
# distribution that serves the page and routes the API's paths to the HTTP
# API above (terraform/modules/site; decision 0018, Issue-39). The API's
# paths come from the manifest's routes, so a route added to the manifest
# gets its behavior in the same plan as its function and its route.
module "site" {
  source = "../site"

  name_prefix     = var.name_prefix
  hostname        = var.hostname
  zone_id         = var.zone_id
  certificate_arn = var.certificate_arn
  price_class     = var.price_class

  api_host  = replace(aws_apigatewayv2_api.this.api_endpoint, "https://", "")
  api_paths = distinct([for key in keys(local.routes) : split(" ", key)[1]])
}
