import fs from "node:fs";
import path from "node:path";

import compression from "compression";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";

import type { Viewer } from "../shared/domain";
import {
  DevelopmentIdentityProvider,
  type IdentityProvider,
} from "./auth";
import type { SqliteDatabase } from "./database";
import { apiErrorHandler, apiNotFound, asyncRoute, HttpError } from "./http-errors";
import { InternJobsRepository } from "./repository";
import {
  companyRouteSchema,
  createAlertBodySchema,
  createEmergingBodySchema,
  followBodySchema,
  jobRouteSchema,
  notificationReadBodySchema,
  promoteEmergingBodySchema,
  reviewEmergingBodySchema,
  routeIdSchema,
  updateAlertBodySchema,
  userJobStateBodySchema,
  userPreferencesBodySchema,
} from "./schemas";

export interface CreateAppOptions {
  database: SqliteDatabase;
  identityProvider?: IdentityProvider;
  repository?: InternJobsRepository;
  enableRateLimit?: boolean;
  serveClient?: boolean;
  clientDistPath?: string;
  logger?: boolean;
}

function requireViewer(response: Response): Viewer {
  const viewer = response.locals.viewer as Viewer | undefined;
  if (!viewer) {
    throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }
  return viewer;
}

function requireAdmin(response: Response): Viewer {
  const viewer = requireViewer(response);
  if (!viewer.isAdmin) {
    throw new HttpError(403, "ADMIN_REQUIRED", "Administrator access is required.");
  }
  return viewer;
}

export function createApp(options: CreateAppOptions) {
  const app = express();
  const identityProvider = options.identityProvider ?? new DevelopmentIdentityProvider();
  const repository = options.repository ?? new InternJobsRepository(options.database);

  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: "128kb", strict: true }));
  if (options.logger !== false) {
    app.use(
      pinoHttp({
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
        redact: ["req.headers.authorization", "req.headers.cookie"],
      }),
    );
  }

  if (options.enableRateLimit !== false) {
    app.use(
      "/api",
      rateLimit({
        windowMs: 60_000,
        limit: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 240),
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (_request, response) => {
          response.status(429).json({
            error: "Too many API requests. Please retry shortly.",
            code: "RATE_LIMITED",
          });
        },
      }),
    );
  }

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", persistence: "sqlite", generatedAt: new Date().toISOString() });
  });

  app.use(
    "/api",
    asyncRoute(async (request: Request, response: Response, next: NextFunction) => {
      response.locals.viewer = await identityProvider.authenticate(request, options.database);
      next();
    }),
  );

  app.get(
    "/api/bootstrap",
    asyncRoute(async (_request, response) => {
      response.json(repository.getBootstrap(requireViewer(response)));
    }),
  );

  app.put(
    "/api/preferences",
    asyncRoute(async (request, response) => {
      const input = userPreferencesBodySchema.parse(request.body);
      const preferences = repository.updateUserPreferences(requireViewer(response).id, input);
      response.json({ preferences });
    }),
  );

  app.put(
    "/api/companies/:companyId/follow",
    asyncRoute(async (request, response) => {
      const { companyId } = companyRouteSchema.parse(request.params);
      const { followed } = followBodySchema.parse(request.body);
      const company = repository.setCompanyFollow(requireViewer(response).id, companyId, followed);
      response.json({ company });
    }),
  );

  app.put(
    "/api/jobs/:jobId/state",
    asyncRoute(async (request, response) => {
      const { jobId } = jobRouteSchema.parse(request.params);
      const input = userJobStateBodySchema.parse(request.body);
      const userState = repository.updateUserJobState(requireViewer(response).id, jobId, input);
      response.json({ jobId, userState });
    }),
  );

  app.post(
    "/api/alerts",
    asyncRoute(async (request, response) => {
      const input = createAlertBodySchema.parse(request.body);
      const alert = repository.createAlert(requireViewer(response).id, input);
      response.status(201).json({ alert });
    }),
  );

  app.patch(
    "/api/alerts/:id",
    asyncRoute(async (request, response) => {
      const { id } = routeIdSchema.parse(request.params);
      const input = updateAlertBodySchema.parse(request.body);
      const alert = repository.updateAlert(requireViewer(response).id, id, input);
      response.json({ alert });
    }),
  );

  app.delete(
    "/api/alerts/:id",
    asyncRoute(async (request, response) => {
      const { id } = routeIdSchema.parse(request.params);
      repository.deleteAlert(requireViewer(response).id, id);
      response.status(204).end();
    }),
  );

  app.patch(
    "/api/notifications/:id/read",
    asyncRoute(async (request, response) => {
      const { id } = routeIdSchema.parse(request.params);
      const { read } = notificationReadBodySchema.parse(request.body ?? {});
      const notification = repository.setNotificationRead(requireViewer(response).id, id, read);
      response.json({ notification });
    }),
  );

  app.post(
    "/api/emerging",
    asyncRoute(async (request, response) => {
      const input = createEmergingBodySchema.parse(request.body);
      const candidate = repository.createEmergingCandidate(requireViewer(response).id, input);
      response.status(201).json({ candidate });
    }),
  );

  app.post(
    "/api/emerging/:id/reviews",
    asyncRoute(async (request, response) => {
      const viewer = requireAdmin(response);
      const { id } = routeIdSchema.parse(request.params);
      const input = reviewEmergingBodySchema.parse(request.body);
      const candidate = repository.reviewEmergingCandidate(viewer.id, id, input);
      response.json({ candidate });
    }),
  );

  app.post(
    "/api/emerging/:id/promote",
    asyncRoute(async (request, response) => {
      const viewer = requireAdmin(response);
      const { id } = routeIdSchema.parse(request.params);
      const input = promoteEmergingBodySchema.parse(request.body ?? {});
      const result = repository.promoteEmergingCandidate(viewer.id, id, input);
      response.json(result);
    }),
  );

  app.use("/api", apiNotFound);

  if (options.serveClient) {
    const clientDistPath = path.resolve(options.clientDistPath ?? path.join(process.cwd(), "dist/client"));
    if (fs.existsSync(clientDistPath)) {
      app.use(express.static(clientDistPath, { index: false, maxAge: "1h" }));
      app.use((request, response, next) => {
        if (request.method !== "GET" || request.path.startsWith("/api/")) {
          next();
          return;
        }
        response.sendFile(path.join(clientDistPath, "index.html"));
      });
    }
  }

  app.use(apiErrorHandler);
  return app;
}
