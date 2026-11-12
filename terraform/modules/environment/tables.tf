# The two tables of decision 0023, named for their partition key. Both carry
# the generic key schema of packages/hub/src/db/keys.ts, PK and SK as
# strings, so an item type is a sort-key prefix and a new type is never a
# table change; the test helper packages/hub/test/setup/table.ts creates the
# same schema in DynamoDB Local. On-demand capacity: nothing is paid at
# rest, and a provisioned table is the one cost the boundary cannot deny
# (terraform/bootstrap/README.md), so none is created here.

# Partitioned by player. Private: read only through the hub.
resource "aws_dynamodb_table" "player" {
  name         = "${var.name_prefix}-player"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  deletion_protection_enabled = var.deletion_protection
}

# Partitioned by location, and by adventure for the record settle looks up
# by id. Public: what every player may see. Its TTL attribute, expiresAt in
# epoch seconds, is set on the heroes seen at a location (decision 0029).
#
# GSI1 is the table's one index, with generic keys as the table's own are
# (decision 0050): the adventure record carries GSI1PK = JOB#<jobId> and
# GSI1SK = <settledAt> from settlement on, and nothing else carries either,
# so the index holds the settled records and is what replaysOf reads. It
# projects every attribute, because ElectroDB reads an index item as the
# whole entity. On-demand like the table, so it costs nothing at rest.
#
# The provider adds the index to the live table in place: the plan against
# heat-sb289 on 2026-11-11, provider 6.72.0, was an update of this resource
# and no replacement, and its apply waited 8 min 36 s for the index to
# become active on a table with almost nothing in it (decision 0053, "Facts
# checked"). The index's keys are `key_schema` blocks, since that release
# deprecates `hash_key` and `range_key` inside the index block.

locals {
  # The index's name, which the function's role reads for the one resource
  # it may Query (functions.tf): one expression, so a rename cannot leave
  # the policy naming an index that is gone.
  replays_index = "GSI1"
}

resource "aws_dynamodb_table" "location" {
  name         = "${var.name_prefix}-location"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = local.replays_index
    projection_type = "ALL"

    key_schema {
      attribute_name = "GSI1PK"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "GSI1SK"
      key_type       = "RANGE"
    }
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  deletion_protection_enabled = var.deletion_protection
}
