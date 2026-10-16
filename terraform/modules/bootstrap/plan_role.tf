# The plan role: what a pull request's plan job, and the agent from its audit
# chain, may see in the workload account. Read only, with the data plane
# taken back: configuration, never contents (decision 0017). It is the only
# new access the agent gets, and it cannot change anything.

data "aws_iam_policy_document" "plan_trust" {
  # A pull request run has no GitHub environment, and GitHub then puts
  # "pull_request" in the subject (GitHub, "OpenID Connect reference", read
  # 2026-10-16). A job under an environment carries the environment name
  # instead, so an apply job cannot satisfy this statement, and a pull
  # request job cannot satisfy the apply role's.
  statement {
    sid     = "GitHubActionsPullRequestRuns"
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

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.github_subject_prefix}:pull_request"]
    }
  }

  # The agent, through the management account's SecurityAudit role: the same
  # hub-and-spoke shape and the same ARN pattern that the organization's
  # AuditRole trusts. The session is at most an hour, as every chained role
  # session is. The other half of this trust, the permission set's own allow
  # to assume heat-*-plan, lives in the dcg-platform repository (README.md).
  statement {
    sid     = "AgentThroughManagementSecurityAudit"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${var.management_account_id}:root"]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:PrincipalArn"
      values   = ["arn:aws:iam::${var.management_account_id}:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_SecurityAudit_*"]
    }
  }
}

resource "aws_iam_role" "plan" {
  provider = aws.workload

  name                 = local.plan_role_name
  description          = "Read-only planning of the ${var.environment} environment: pull request plan jobs and the agent through the management SecurityAudit role. Configuration, never data."
  assume_role_policy   = data.aws_iam_policy_document.plan_trust.json
  max_session_duration = 3600
}

# AWS's ReadOnlyAccess (v190, 2026-09-24, checked that day) is the base: it
# is what terraform plan needs, across every service, kept current by AWS.
# It also reaches into the data plane, and the inline policy below takes
# that back.
resource "aws_iam_role_policy_attachment" "plan_read_only" {
  provider = aws.workload

  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "plan" {
  # ReadOnlyAccess grants dynamodb:Get*, Query, Scan, BatchGet* and
  # PartiQLSelect: the table's items. Denied; the table's definition is
  # still readable.
  statement {
    sid    = "DenyTableItems"
    effect = "Deny"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:PartiQLSelect",
      "dynamodb:GetRecords",
      "dynamodb:GetShardIterator",
    ]

    resources = ["*"]
  }

  # ReadOnlyAccess grants s3:Get* and s3:List*. Object reads are denied on
  # every bucket except this account's prefix in the state bucket, which the
  # plan needs; the bucket's own policy in heat-platform grants the other
  # half of that cross-account read. Bucket and key listings stay.
  statement {
    sid           = "DenyObjectsExceptThisAccountsState"
    effect        = "Deny"
    actions       = ["s3:GetObject*"]
    not_resources = ["arn:aws:s3:::${local.state_bucket}/${local.state_key_prefix}*"]
  }

  # Secret values are not in ReadOnlyAccess; the deny is there so that no
  # later attachment opens them. Message receipt is, and is a read that
  # consumes.
  statement {
    sid    = "DenySecretsAndMessages"
    effect = "Deny"

    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:BatchGetSecretValue",
      "sqs:ReceiveMessage",
    ]

    resources = ["*"]
  }

  # Log lines only from this environment's own log groups, whose names carry
  # the resource prefix (/aws/lambda/heat-dev-hub and the like). The four
  # actions here are the ones that take a log group or stream as their
  # resource; GetQueryResults and GetLogRecord take none and are left alone,
  # since a query can only have been started on an allowed group.
  statement {
    sid    = "DenyLogLinesOutsideThisEnvironment"
    effect = "Deny"

    actions = [
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
      "logs:StartQuery",
      "logs:StartLiveTail",
    ]

    not_resources = ["arn:aws:logs:us-east-1:${var.workload_account_id}:log-group:*${local.resource_prefix}*"]
  }

  # ReadOnlyAccess grants cognito-idp:AdminGet* and List*: user records, which
  # in dev and prod are players' records. Denied there. In the sandbox
  # account every user is a test user that the sandbox base creates through
  # Terraform, and refreshing an aws_cognito_user calls AdminGetUser, so the
  # sandbox plan role keeps the read.
  dynamic "statement" {
    for_each = var.environment == "sandbox" ? [] : [1]

    content {
      sid    = "DenyUserRecords"
      effect = "Deny"

      actions = [
        "cognito-idp:AdminGetUser",
        "cognito-idp:ListUsers",
        "cognito-idp:ListUsersInGroup",
        "cognito-idp:AdminListGroupsForUser",
        "cognito-idp:AdminListUserAuthEvents",
        "cognito-idp:AdminListDevices",
      ]

      resources = ["*"]
    }
  }
}

resource "aws_iam_role_policy" "plan" {
  provider = aws.workload

  name   = "configuration-not-data"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan.json
}
