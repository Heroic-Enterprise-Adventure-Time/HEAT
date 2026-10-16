# A monthly cost budget for the workload account, with email alerts and one
# automatic action: when the month's actual spend passes the budget, AWS
# Budgets attaches a deny-all policy to the apply role, and nothing more can
# be created until the owner has found the cause and lifted it (decision
# 0017, guardrail 3). Nothing deployed costs much, which is exactly when a
# runaway goes unnoticed until the invoice.
#
# Actual-spend alerts fire once per threshold per month. The forecast alert
# needs about five weeks of usage data before AWS will send it (AWS Budgets
# best practices, read 2026-10-15). Each alert goes to one address, given in
# the ignored terraform.tfvars and never committed. Budgets with
# notifications are free; the first two action-enabled budgets are free and
# each further one costs $0.10 a day (AWS Budgets pricing, read 2026-10-16).
resource "aws_budgets_budget" "monthly_cost" {
  provider = aws.workload

  name         = "heat-${var.environment}-monthly-cost"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}

# The policy the action attaches. Customer managed, because that is what a
# budget action attaches. It denies everything; the boundary forbids the
# apply role from detaching it, so only the owner can.
data "aws_iam_policy_document" "freeze" {
  statement {
    sid       = "FreezeEverything"
    effect    = "Deny"
    actions   = ["*"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "freeze" {
  provider = aws.workload

  name        = local.freeze_policy_name
  description = "Attached to heat-${var.environment}-apply by the budget action when the month's spend passes the budget. Denies everything. Detached by the owner once the cause is found."
  policy      = data.aws_iam_policy_document.freeze.json
}

# The service role AWS Budgets assumes to run the action. The trust is the
# one the Cost Management user guide gives for budget actions (read
# 2026-10-16): the Budgets service, for this account's budgets only, which
# is the confused-deputy guard. The permissions are the two actions the
# action needs, on the one role and for the one policy, not the guide's
# broad example.
data "aws_iam_policy_document" "budget_action_trust" {
  statement {
    sid     = "BudgetsServiceForThisAccountsBudgets"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.workload_account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:budgets::${var.workload_account_id}:budget/*"]
    }
  }
}

resource "aws_iam_role" "budget_action" {
  provider = aws.workload

  name               = local.budget_action_role_name
  description        = "Assumed by AWS Budgets to attach or detach the freeze policy on heat-${var.environment}-apply. Nothing else."
  assume_role_policy = data.aws_iam_policy_document.budget_action_trust.json
}

data "aws_iam_policy_document" "budget_action" {
  statement {
    sid    = "AttachOrDetachTheFreezeOnTheApplyRole"
    effect = "Allow"

    actions = [
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
    ]

    resources = [aws_iam_role.apply.arn]

    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = [aws_iam_policy.freeze.arn]
    }
  }
}

resource "aws_iam_role_policy" "budget_action" {
  provider = aws.workload

  name   = "freeze-the-apply-role"
  role   = aws_iam_role.budget_action.id
  policy = data.aws_iam_policy_document.budget_action.json
}

# The action: automatic, on actual spend at 100% of the budget. The
# subscriber is told when it runs. Reversing it, and resetting it so that
# Budgets evaluates it again in the same month, is the owner's console step
# on the budget's action history (Cost Management user guide, "Reviewing and
# approving your budget action", read 2026-10-16). What the action cannot
# do: stop what is already running. A function that keeps invoking keeps
# spending; a kill switch for that is the environment stack's (Issue-38).
resource "aws_budgets_budget_action" "freeze_apply_role" {
  provider = aws.workload

  budget_name        = aws_budgets_budget.monthly_cost.name
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budget_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.freeze.arn
      roles      = [aws_iam_role.apply.name]
    }
  }

  subscriber {
    address           = var.budget_alert_email
    subscription_type = "EMAIL"
  }

  # Budgets checks the role when the action is created; its inline policy
  # has to be there first.
  depends_on = [aws_iam_role_policy.budget_action]
}
