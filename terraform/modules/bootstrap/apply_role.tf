# The apply role: the identity that creates and changes an environment, from
# GitHub Actions and nowhere else. An administrator inside the permissions
# boundary and nothing outside it (decision 0017, boundary shape per 0019).

data "aws_iam_policy_document" "apply_trust" {
  statement {
    sid     = "GitHubActionsThisRepositoryThisEnvironment"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # StringLike, because the sandbox account trusts every per-stack GitHub
    # environment, sandbox-<issue>, through the pattern sandbox-* (decision
    # 0019). For dev and prod the value has no wildcard, and StringLike is
    # then an exact match.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.github_subject_prefix}:environment:${var.github_environment}"]
    }
  }
}

resource "aws_iam_role" "apply" {
  provider = aws.workload

  name                 = local.apply_role_name
  description          = "Applies the ${var.environment} environment from GitHub Actions jobs under the ${var.github_environment} environment. Administrator within its permissions boundary."
  assume_role_policy   = data.aws_iam_policy_document.apply_trust.json
  max_session_duration = 3600
  permissions_boundary = aws_iam_policy.boundary.arn
}

resource "aws_iam_role_policy_attachment" "apply_administrator" {
  provider = aws.workload

  role       = aws_iam_role.apply.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
