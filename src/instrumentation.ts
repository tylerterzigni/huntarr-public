export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initBackgroundJobs } = await import("@/lib/jobs/sync-cron");
    initBackgroundJobs();
  }
}
