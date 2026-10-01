import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CanvasClient } from "../canvasClient.js";

export function registerCourseTabTools(server: McpServer, canvas: CanvasClient) {
  // Tool: list-course-tabs
  server.tool(
    "list-course-tabs",
    "List a course's navigation tabs (Home, Announcements, Grades, Files, etc.) with their order and whether each is hidden from students.",
    {
      courseId: z.string().describe("The ID of the course")
    },
    { readOnlyHint: true },
    async ({ courseId }: { courseId: string }) => {
      try {
        const tabs = await canvas.listCourseTabs(courseId);
        const summary = tabs.map((t: any) => ({
          id: t.id,
          label: t.label,
          position: t.position,
          hidden: t.hidden === true,
          visibility: t.visibility,
          type: t.type,
        }));
        return { content: [{ type: "text", text: JSON.stringify(summary) }] };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch course tabs: ${error.message}`);
        }
        throw new Error('Failed to fetch course tabs: Unknown error');
      }
    }
  );

  // Tool: update-course-tab
  server.tool(
    "update-course-tab",
    "Hide/show a course navigation tab or change its position. The Home and Settings tabs cannot be hidden or moved. Use list-course-tabs to find tab IDs.",
    {
      courseId: z.string().describe("The ID of the course"),
      tabId: z.string().describe("The tab ID, e.g. 'grades' or 'context_external_tool_123' (from list-course-tabs)"),
      hidden: z.boolean().optional().describe("true to hide the tab from students, false to show it"),
      position: z.number().optional().describe("New 1-based position of the tab")
    },
    { idempotentHint: true },
    async ({ courseId, tabId, hidden, position }: { courseId: string; tabId: string; hidden?: boolean; position?: number }) => {
      try {
        if (hidden === undefined && position === undefined) {
          throw new Error('At least one of hidden or position must be provided.');
        }
        const data: any = {};
        if (hidden !== undefined) data.hidden = hidden;
        if (position !== undefined) data.position = position;
        const t = await canvas.updateCourseTab(courseId, tabId, data);
        return {
          content: [{ type: "text", text: `Tab updated: id=${t.id}, label="${t.label}", position=${t.position}, hidden=${t.hidden === true}, visibility=${t.visibility}` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to update course tab: ${error.message}`);
        }
        throw new Error('Failed to update course tab: Unknown error');
      }
    }
  );
}
