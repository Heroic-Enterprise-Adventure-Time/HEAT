# A monthly cost budget for the workload account, with email alerts. Nothing
# deployed costs much, which is exactly when a runaway goes unnoticed until
# the invoice. Budgets with notifications are free; there are no budget
# actions (AWS Budgets pricing, read 2026-10-15; README.md).
#
# Actual-spend alerts fire once per threshold per month. The forecast alert
# needs about five weeks of usage data before AWS will send it (AWS Budgets
# best practices, read 2026-10-15). Each alert goes to one address, given in
# the ignored terraform.tfvars and never committed.
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
