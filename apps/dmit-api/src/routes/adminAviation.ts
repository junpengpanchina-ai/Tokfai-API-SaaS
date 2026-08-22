import { Hono } from "hono";

export const adminAviationRoutes = new Hono();

adminAviationRoutes.post("/jobs", async (c) => {
  const jobId = `av_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return c.json({
    jobId,
    status: "created",
  });
});

adminAviationRoutes.get("/jobs/:jobId/status", async (c) => {
  const jobId = c.req.param("jobId");
  return c.json({
    jobId,
    status: "created",
    fileCount: 0,
    hasExtract: false,
    hasResult: false,
  });
});
