import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CanvasClient } from "../canvasClient.js";

const TERMINAL_STATES = ['completed', 'failed'];

function describeMigration(m: any): string {
  const lines = [
    `Migration ${m.id}: ${m.workflow_state}`,
    m.migration_issues_count ? `Issues reported: ${m.migration_issues_count}` : undefined,
    m.migration_issues_url ? `Issues URL: ${m.migration_issues_url}` : undefined,
  ];
  return lines.filter(Boolean).join('\n');
}

export function registerContentMigrationTools(server: McpServer, canvas: CanvasClient) {
  // Tool: copy-course-content
  server.tool(
    "copy-course-content",
    "Copy ALL content (assignments, pages, modules, quizzes, files, discussions, settings, etc.) from a source course into a destination course, optionally shifting or removing dates. Content is ADDED to the destination; nothing is deleted there, so copying into a non-empty course can create duplicates. Canvas runs this as a background job; the tool waits briefly and reports progress, and get-content-migration can be used to check later.",
    {
      sourceCourseId: z.string().describe("The ID of the course to copy FROM"),
      destinationCourseId: z.string().describe("The ID of the course to copy INTO (usually a new, empty course)"),
      shiftDates: z.boolean().optional().describe("Shift all dates by the difference between the old and new start dates. Requires oldStartDate and newStartDate."),
      oldStartDate: z.string().optional().describe("Start date of the source course, YYYY-MM-DD"),
      newStartDate: z.string().optional().describe("Start date of the destination course, YYYY-MM-DD"),
      oldEndDate: z.string().optional().describe("End date of the source course, YYYY-MM-DD"),
      newEndDate: z.string().optional().describe("End date of the destination course, YYYY-MM-DD"),
      removeDates: z.boolean().optional().describe("Remove all dates from copied content instead of shifting them. Cannot be combined with shiftDates.")
    },
    { destructiveHint: false },
    async ({ sourceCourseId, destinationCourseId, shiftDates, oldStartDate, newStartDate, oldEndDate, newEndDate, removeDates }: {
      sourceCourseId: string; destinationCourseId: string; shiftDates?: boolean;
      oldStartDate?: string; newStartDate?: string; oldEndDate?: string; newEndDate?: string; removeDates?: boolean;
    }) => {
      try {
        if (sourceCourseId === destinationCourseId) {
          throw new Error('Source and destination courses must be different.');
        }
        if (shiftDates && removeDates) {
          throw new Error('shiftDates and removeDates cannot be used together.');
        }
        if (shiftDates && (!oldStartDate || !newStartDate)) {
          throw new Error('shiftDates requires both oldStartDate and newStartDate.');
        }

        const body: any = {
          migration_type: 'course_copy_importer',
          settings: { source_course_id: sourceCourseId },
        };
        if (shiftDates || removeDates) {
          const opts: any = {};
          if (shiftDates) {
            opts.shift_dates = true;
            opts.old_start_date = oldStartDate;
            opts.new_start_date = newStartDate;
            if (oldEndDate) opts.old_end_date = oldEndDate;
            if (newEndDate) opts.new_end_date = newEndDate;
          }
          if (removeDates) opts.remove_dates = true;
          body.date_shift_options = opts;
        }

        let migration = await canvas.createContentMigration(destinationCourseId, body);

        // Poll briefly so the caller gets a real status rather than just "started".
        const start = Date.now();
        const timeoutMs = 20000;
        while (migration && !TERMINAL_STATES.includes(migration.workflow_state) && Date.now() - start < timeoutMs) {
          await new Promise(r => setTimeout(r, 2000));
          migration = await canvas.getContentMigration(destinationCourseId, String(migration.id));
        }

        const note = migration.workflow_state === 'completed'
          ? 'Copy completed.'
          : migration.workflow_state === 'failed'
            ? 'Copy failed. Check the issues URL above.'
            : `Still running in Canvas. Use get-content-migration with courseId=${destinationCourseId}, migrationId=${migration.id} to check again.`;
        return {
          content: [{ type: "text", text: `${describeMigration(migration)}\n${note}` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to copy course content: ${error.message}`);
        }
        throw new Error('Failed to copy course content: Unknown error');
      }
    }
  );

  // Tool: get-content-migration
  server.tool(
    "get-content-migration",
    "Check the status of a course content copy (see copy-course-content). Returns the state (running, completed, failed) and any issues.",
    {
      courseId: z.string().describe("The ID of the destination course the content was copied into"),
      migrationId: z.string().describe("The migration ID returned by copy-course-content")
    },
    { readOnlyHint: true },
    async ({ courseId, migrationId }: { courseId: string; migrationId: string }) => {
      try {
        const m = await canvas.getContentMigration(courseId, migrationId);
        return { content: [{ type: "text", text: describeMigration(m) }] };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch content migration: ${error.message}`);
        }
        throw new Error('Failed to fetch content migration: Unknown error');
      }
    }
  );
}
