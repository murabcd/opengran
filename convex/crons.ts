import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
	"cleanup expired trash",
	"0 2 * * *",
	internal.trash.cleanupExpiredItems,
	{},
);

export default crons;
