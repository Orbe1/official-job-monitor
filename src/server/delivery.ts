import { randomUUID } from "node:crypto";

import type { SqliteDatabase } from "./database";

export interface EmailMessage {
  notificationId: string;
  recipient: string;
  subject: string;
  text: string;
}

export interface EmailDeliveryResult {
  status: "development_email" | "delivered" | "failed";
  providerMessageId: string | null;
  error: string | null;
}

export interface EmailDeliveryProvider {
  readonly kind: "development" | "production";
  deliver(message: EmailMessage): Promise<EmailDeliveryResult> | EmailDeliveryResult;
}

/**
 * Development-only delivery. It records an inspectable database delivery row
 * and never sends network email.
 */
export class LocalDatabaseEmailDelivery implements EmailDeliveryProvider {
  readonly kind = "development" as const;

  constructor(private readonly database: SqliteDatabase) {}

  deliver(message: EmailMessage): EmailDeliveryResult {
    const id = `delivery-${randomUUID()}`;
    const createdAt = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO notification_deliveries (
          id, notification_id, channel, recipient, provider, status,
          attempt_count, last_attempt_at, delivered_at, provider_message_id,
          error_details, payload_json, created_at, updated_at
        ) VALUES (?, ?, 'email', ?, 'local_development', 'development_only',
                  1, ?, ?, NULL, NULL, ?, ?, ?)`,
      )
      .run(
        id,
        message.notificationId,
        message.recipient,
        createdAt,
        createdAt,
        JSON.stringify({ subject: message.subject, text: message.text, localOnly: true }),
        createdAt,
        createdAt,
      );

    return { status: "development_email", providerMessageId: null, error: null };
  }
}

export class UnconfiguredProductionEmailDelivery implements EmailDeliveryProvider {
  readonly kind = "production" as const;

  deliver(): EmailDeliveryResult {
    return {
      status: "failed",
      providerMessageId: null,
      error: "Production email delivery is not configured.",
    };
  }
}
