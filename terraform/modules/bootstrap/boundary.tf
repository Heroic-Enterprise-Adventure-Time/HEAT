# The permissions boundary of the apply role, and of every role the
# environment stacks create under it. A boundary grants nothing by itself: it
# is the ceiling under which the role's own AdministratorAccess applies.
# Shape per decision 0019: an allow-list of the services the decided shape
# uses, with explicit denies on top for what must hold whatever else is
# attached. Anything not listed is implicitly denied. A branch that rewrites
# the workflow runs as the apply role and no wider (decision 0017).

data "aws_iam_policy_document" "boundary" {
  # The ceiling: the services of decisions 0012, 0013 and 0018. Adding a
  # service is a change to this list, applied by the owner, which is the
  # right amount of friction for a new service in an environment.
  statement {
    sid    = "ServicesTheShapeUses"
    effect = "Allow"

    actions = [
      "lambda:*",
      "apigateway:*",
      "execute-api:*",
      "dynamodb:*",
      "s3:*",
      "cognito-idp:*",
      "cloudfront:*",
      "acm:*",
      "route53:*",
      "logs:*",
      "cloudwatch:*",
      # Where a CloudWatch alarm sends its notification: a topic per
      # permanent environment with the owner's address subscribed (Issue-40).
      # Nothing else in the shape publishes or queues.
      "sns:*",
      "ssm:*",
      "xray:*",
      "iam:*",
      "sts:GetCallerIdentity",
    ]

    resources = ["*"]
  }

  # The services that cost money while idle, named in decision 0017 and
  # Issue-36. None is in the ceiling; the explicit deny holds even if the
  # list above is widened by mistake or a resource policy in this account
  # grants a role session directly. ec2 as a whole is the no-VPC assumption
  # of the overview, enforced: no instance, volume, address, NAT gateway or
  # endpoint. What cannot be denied here: DynamoDB provisioned capacity has
  # no IAM condition key, so a provisioned table is caught by the plan-time
  # allow-list and the budget action, not by the boundary.
  statement {
    sid    = "DenyWhatCostsMoneyWhileIdle"
    effect = "Deny"

    actions = [
      "ec2:*",
      "elasticloadbalancing:*",
      "rds:*",
      "elasticache:*",
      "es:*",
      "aoss:*",
      "redshift:*",
      "redshift-serverless:*",
      "kafka:*",
      "kinesis:*",
      "sagemaker:*",
      "ecs:*",
      "eks:*",
      "elasticfilesystem:*",
      "lambda:PutProvisionedConcurrencyConfig",
    ]

    resources = ["*"]
  }

  # The guardrails themselves: the two roles, the budget's role, this
  # boundary, the freeze policy and the identity provider. No IAM action on
  # any of them, so a workflow cannot widen its own trust, lift its boundary,
  # or detach the freeze once the budget has attached it.
  statement {
    sid     = "DenyTouchingTheGuardrails"
    effect  = "Deny"
    actions = ["iam:*"]

    resources = [
      "arn:aws:iam::${var.workload_account_id}:role/${local.plan_role_name}",
      "arn:aws:iam::${var.workload_account_id}:role/${local.apply_role_name}",
      "arn:aws:iam::${var.workload_account_id}:role/${local.budget_action_role_name}",
      local.boundary_policy_arn,
      "arn:aws:iam::${var.workload_account_id}:policy/${local.freeze_policy_name}",
      "arn:aws:iam::${var.workload_account_id}:oidc-provider/token.actions.githubusercontent.com",
    ]
  }

  # IAM writes stay inside the environment's own names. PlatformAdminRole,
  # AuditRole and Control Tower's roles are out of reach. PassRole is in the
  # list, so only a role under the prefix can be handed to a service.
  statement {
    sid    = "DenyRoleWritesOutsideThePrefix"
    effect = "Deny"

    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:UpdateAssumeRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:PutRolePermissionsBoundary",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:PassRole",
    ]

    not_resources = ["arn:aws:iam::${var.workload_account_id}:role/${local.resource_prefix}*"]
  }

  statement {
    sid    = "DenyPolicyWritesOutsideThePrefix"
    effect = "Deny"

    actions = [
      "iam:CreatePolicy",
      "iam:DeletePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion",
      "iam:TagPolicy",
      "iam:UntagPolicy",
    ]

    not_resources = ["arn:aws:iam::${var.workload_account_id}:policy/${local.resource_prefix}*"]
  }

  # Every role created, or re-bounded, by a role under this boundary carries
  # this boundary, and no role loses it (IAM user guide, "Delegating
  # responsibility to others using permissions boundaries", read 2026-10-16).
  # So nothing the pipeline creates, a function's execution role included,
  # can do more than the pipeline. A CreateRole without the parameter has no
  # iam:PermissionsBoundary key, and StringNotEquals on a missing key
  # matches, so that is denied too.
  statement {
    sid    = "RolesMustCarryThisBoundary"
    effect = "Deny"

    actions = [
      "iam:CreateRole",
      "iam:PutRolePermissionsBoundary",
    ]

    resources = ["*"]

    condition {
      test     = "StringNotEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.boundary_policy_arn]
    }
  }

  statement {
    sid    = "DenyRemovingAnyBoundary"
    effect = "Deny"

    actions = [
      "iam:DeleteRolePermissionsBoundary",
      "iam:DeleteUserPermissionsBoundary",
    ]

    resources = ["*"]
  }

  # No new identities and no new trust paths: users and keys (the
  # organization's controls deny these as well), identity providers, and
  # assuming any other role from this one.
  statement {
    sid    = "DenyNewIdentitiesAndTrustPaths"
    effect = "Deny"

    actions = [
      "iam:CreateUser",
      "iam:CreateAccessKey",
      "iam:CreateLoginProfile",
      "iam:CreateServiceSpecificCredential",
      "iam:CreateOpenIDConnectProvider",
      "iam:CreateSAMLProvider",
      "iam:AddClientIDToOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint",
      "sts:AssumeRole",
      "sts:AssumeRoleWithSAML",
      "sts:AssumeRoleWithWebIdentity",
    ]

    resources = ["*"]
  }

  # The budget and its action are the owner's guardrail; the account and the
  # organization belong to the organization layer.
  statement {
    sid    = "DenyBudgetsAccountAndOrganization"
    effect = "Deny"

    actions = [
      "budgets:*",
      "ce:*",
      "account:*",
      "organizations:*",
    ]

    resources = ["*"]
  }
}

resource "aws_iam_policy" "boundary" {
  provider = aws.workload

  name        = local.boundary_policy_name
  description = "Permissions boundary of heat-${var.environment}-apply and of every role the ${var.environment} environment creates. The ceiling, not a grant."
  policy      = data.aws_iam_policy_document.boundary.json
}
