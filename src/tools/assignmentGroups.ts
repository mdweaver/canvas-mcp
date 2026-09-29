import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CanvasClient } from "../canvasClient.js";

export function registerAssignmentGroupTools(server: McpServer, canvas: CanvasClient) {
  // Tool: list-assignment-groups
  server.tool(
    "list-assignment-groups",
    "List all assignment groups (buckets) in a course.",
    {
      courseId: z.string().describe("The ID of the course")
    },
    { readOnlyHint: true },
    async ({ courseId }: { courseId: string }) => {
      try {
        const groups = await canvas.listAssignmentGroups(courseId) as any[];
        const summary = groups.map((g: any) => ({
          id: g.id,
          name: g.name,
          position: g.position,
          group_weight: g.group_weight,
          rules: g.rules ?? null,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(summary) }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch assignment groups: ${error.message}`);
        }
        throw new Error('Failed to fetch assignment groups: Unknown error');
      }
    }
  );

  // Tool: create-assignment-group
  server.tool(
    "create-assignment-group",
    "Create a new assignment group (bucket) in a course. All fields optional except courseId.",
    {
      courseId: z.string().describe("The ID of the course"),
      name: z.string().optional(),
      position: z.number().optional(),
      group_weight: z.number().optional(),
      sis_source_id: z.string().optional(),
      integration_data: z.any().optional(),
      rules: z.any().optional()
    },
    { destructiveHint: false },
    async (args: any) => {
      const { courseId, ...fields } = args;
      try {
        const g = await canvas.createAssignmentGroup(courseId, { assignment_group: fields }) as any;
        return {
          content: [{ type: "text", text: `Assignment group created: id=${g.id}, name="${g.name}", position=${g.position}, weight=${g.group_weight}` }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to create assignment group: ${error.message}`);
        }
        throw new Error('Failed to create assignment group: Unknown error');
      }
    }
  );

  // Tool: bulk-update-assignment-dates
  server.tool(
    "bulk-update-assignment-dates",
    "Bulk update due/unlock/lock dates for assignments in a course.",
    {
      courseId: z.string().describe("The ID of the course"),
      assignmentDates: z.array(z.object({
        assignment_id: z.string().describe("The ID of the assignment"),
        due_at: z.string().optional().describe("New due date (ISO 8601)"),
        unlock_at: z.string().optional().describe("New unlock date (ISO 8601)"),
        lock_at: z.string().optional().describe("New lock date (ISO 8601)")
      })).describe("Array of assignment date updates")
    },
    { idempotentHint: true },
    async ({ courseId, assignmentDates }: { courseId: string; assignmentDates: any[] }) => {
      try {
        // Canvas's bulk_update endpoint expects the request body to be a raw
        // array (not wrapped in a key), where each entry is
        // { id, all_dates: [{ base: true, due_at?, unlock_at?, lock_at? }] }.
        // See: PUT /api/v1/courses/:course_id/assignments/bulk_update
        const payload = assignmentDates.map(({ assignment_id, due_at, unlock_at, lock_at }) => {
          const dateSet: any = { base: true };
          if (due_at !== undefined) dateSet.due_at = due_at;
          if (unlock_at !== undefined) dateSet.unlock_at = unlock_at;
          if (lock_at !== undefined) dateSet.lock_at = lock_at;
          return { id: Number(assignment_id), all_dates: [dateSet] };
        });
        const progress = await canvas.put<any>(
          `/api/v1/courses/${courseId}/assignments/bulk_update`,
          payload
        );
        // The endpoint runs as a background job and returns a Progress object.
        // Poll it briefly so the caller gets a real completion status instead
        // of just "submitted".
        let finalState: any = progress;
        if (progress?.url) {
          const start = Date.now();
          const timeoutMs = 20000;
          while (
            finalState &&
            !['completed', 'failed'].includes(finalState.workflow_state) &&
            Date.now() - start < timeoutMs
          ) {
            await new Promise(r => setTimeout(r, 1000));
            finalState = await canvas.get<any>(finalState.url);
          }
        }
        const status = finalState?.workflow_state || 'queued';
        const note = status === 'completed'
          ? 'Canvas confirms the update completed.'
          : status === 'failed'
            ? `Canvas reported the job failed${finalState?.message ? `: ${finalState.message}` : '.'}`
            : `Canvas is still processing (status: ${status}); re-check the assignments shortly if dates don't look updated yet.`;
        return {
          content: [{ type: "text", text: `Bulk date update submitted for ${assignmentDates.length} assignment(s) in course ${courseId}. ${note}` }]
        };
      } catch (error: any) {
        if (error instanceof Error) {
          throw new Error(`Failed to bulk update assignment dates: ${error.message}`);
        }
        throw new Error('Failed to bulk update assignment dates: Unknown error');
      }
    }
  );
} 