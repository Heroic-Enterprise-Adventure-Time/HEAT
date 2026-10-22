import { GetObjectCommand, PutObjectCommand, S3ServiceException, type S3Client } from "@aws-sdk/client-s3";

/**
 * The replay bucket (overview, "Services and data"; decision 0030): one
 * timeline per settled adventure, `<adventureId>.json`, written by the hub
 * before the settlement transaction and read back through the hub. The
 * object is the engine's `AdventureTimeline` as JSON, which carries the
 * version that wrote it and the schema version of its events.
 *
 * A timeline is written once. The write is conditional, `If-None-Match: *`,
 * so the first timeline stored for an adventure is the one it keeps: a
 * second write to the key fails with 412 (S3 user guide, "How to prevent
 * object overwrites with conditional writes", read 2026-10-22), and the hub
 * then settles with the stored timeline's result, so the record and the
 * replay never disagree.
 *
 * The store is an interface so that the data-layer tests run with nothing
 * but DynamoDB Local; the S3 implementation is proven on the stack by the
 * stack test, which reads a timeline back.
 */
export interface Timelines {
  /** Writes the body if the adventure has no timeline yet; false if it has one. */
  putIfAbsent(adventureId: string, body: string): Promise<boolean>;
  /** The stored body, or undefined if there is none. */
  get(adventureId: string): Promise<string | undefined>;
}

const key = (adventureId: string) => `${adventureId}.json`;

export class S3Timelines implements Timelines {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async putIfAbsent(adventureId: string, body: string): Promise<boolean> {
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key(adventureId),
          Body: body,
          ContentType: "application/json",
          IfNoneMatch: "*",
        }),
      );
      return true;
    } catch (e) {
      // 412: a timeline is already stored, or a concurrent write finished
      // first. S3's 409 comes only from a delete racing the write, and
      // nothing deletes a timeline, so it is an error like any other.
      if (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 412) return false;
      throw e;
    }
  }

  async get(adventureId: string): Promise<string | undefined> {
    try {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key(adventureId) }));
      return await r.Body?.transformToString();
    } catch (e) {
      // Without s3:ListBucket a missing key answers 403 rather than 404.
      if (e instanceof S3ServiceException && [403, 404].includes(e.$metadata.httpStatusCode ?? 0)) return undefined;
      throw e;
    }
  }
}

/** A store in memory, for the data-layer tests: the same contract, nothing behind it. */
export class MemoryTimelines implements Timelines {
  readonly objects = new Map<string, string>();

  async putIfAbsent(adventureId: string, body: string): Promise<boolean> {
    if (this.objects.has(adventureId)) return false;
    this.objects.set(adventureId, body);
    return true;
  }

  async get(adventureId: string): Promise<string | undefined> {
    return this.objects.get(adventureId);
  }
}
