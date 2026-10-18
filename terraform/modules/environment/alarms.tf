# The environment's alarms: one topic the owner's address is subscribed to,
# and three alarms per function, on errors, throttles and duration. Created
# only where the root names an address (dev and prod); a sandbox stack
# passes null and gets none, since nobody is on call for a branch
# (Issue-40; the thresholds were settled in its shape conversation,
# 2026-10-18).
#
# The topic is the one SNS resource in the shape, which is why sns joined the
# boundary's ceiling in the same change (terraform/modules/bootstrap). The
# email subscription stays "pending confirmation" until the owner clicks the
# link SNS sends; the provider does not wait for that, and cannot delete a
# subscription that was never confirmed (its documentation, read
# 2026-10-18), so the address is confirmed once and then left alone.
#
# The metrics are Lambda's per function, by FunctionName, which counts
# every version and alias together: what the routes invoke through the live
# alias is included. Missing data is not breaching, because a quiet hour has
# no invocations and no errors. Each alarm notifies on entering ALARM and on
# returning to OK, so a message is always followed by its all-clear.

locals {
  alarms_enabled = var.alarm_email != null

  # Keyed by function name only where alarms are on, so a sandbox stack
  # plans no alarm resources at all.
  alarmed_functions = local.alarms_enabled ? var.functions : {}
}

resource "aws_sns_topic" "alarms" {
  count = local.alarms_enabled ? 1 : 0

  name         = "${var.name_prefix}-alarms"
  display_name = "${var.name_prefix} alarms"
}

resource "aws_sns_topic_subscription" "alarm_email" {
  count = local.alarms_enabled ? 1 : 0

  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# Any failed invocation: an unhandled exception, a timeout, or a crash of
# the runtime. One in five minutes is worth a message in an environment
# where every request is a person's.
resource "aws_cloudwatch_metric_alarm" "function_errors" {
  for_each = local.alarmed_functions

  alarm_name        = "${var.name_prefix}-${each.key}-errors"
  alarm_description = "${var.name_prefix}-${each.key}: at least one failed invocation in five minutes."

  namespace   = "AWS/Lambda"
  metric_name = "Errors"
  dimensions  = { FunctionName = aws_lambda_function.function[each.key].function_name }

  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alarms[0].arn]
  ok_actions    = [aws_sns_topic.alarms[0].arn]
}

# A throttle means the account's concurrency is exhausted: in heat-dev the
# quota is ten, the HTTP API's own throttle is the kill switch above it,
# and one throttled invocation is the sign that something is looping.
resource "aws_cloudwatch_metric_alarm" "function_throttles" {
  for_each = local.alarmed_functions

  alarm_name        = "${var.name_prefix}-${each.key}-throttles"
  alarm_description = "${var.name_prefix}-${each.key}: at least one throttled invocation in a minute; the account's concurrency is exhausted."

  namespace   = "AWS/Lambda"
  metric_name = "Throttles"
  dimensions  = { FunctionName = aws_lambda_function.function[each.key].function_name }

  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alarms[0].arn]
  ok_actions    = [aws_sns_topic.alarms[0].arn]
}

# Slowness before it becomes timeouts: the 95th percentile of the duration
# at half the function's own timeout from the manifest, over two of three
# five-minute periods, so that one cold start does not alarm and a sustained
# slowdown does.
resource "aws_cloudwatch_metric_alarm" "function_duration" {
  for_each = local.alarmed_functions

  alarm_name        = "${var.name_prefix}-${each.key}-duration"
  alarm_description = "${var.name_prefix}-${each.key}: p95 duration at or above half the timeout (${each.value.timeoutSeconds * 500} ms) in two of three five-minute periods."

  namespace   = "AWS/Lambda"
  metric_name = "Duration"
  dimensions  = { FunctionName = aws_lambda_function.function[each.key].function_name }

  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = each.value.timeoutSeconds * 500
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alarms[0].arn]
  ok_actions    = [aws_sns_topic.alarms[0].arn]
}
