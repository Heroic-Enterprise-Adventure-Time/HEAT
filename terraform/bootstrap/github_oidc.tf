# GitHub Actions as an identity provider in the workload account. A workflow
# exchanges GitHub's OIDC token for credentials of the deploy role, so there
# are no long-lived credentials anywhere (decision 0011).
#
# No thumbprint_list, on purpose. For GitHub, AWS validates the token
# endpoint's certificate against its own library of trusted root CAs and
# ignores any thumbprint. The provider documentation and the IAM user guide
# both say so; README.md names them.
resource "aws_iam_openid_connect_provider" "github" {
  provider = aws.workload

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
