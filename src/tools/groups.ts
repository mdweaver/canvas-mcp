import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CanvasClient } from "../canvasClient.js";

// Privacy note: none of these tools return student names or emails. Groups are
// reported by name and member COUNT only, and add-group-member takes a user ID
// and echoes back IDs only. Group membership lists are deliberately not exposed.

export function registerGroupTools(server: McpServer, canvas: CanvasClient) {
  // Tool: list-group-categories
  server.tool(
    "list-group-categories",
    "List the group sets (group categories) in a course, e.g. 'Project Teams'. Returns ID, name, self-signup setting, and group size limit.",
    {
      courseId: z.string().describe("The ID of the course")
    },
    { readOnlyHint: true },
    async ({ courseId }: { courseId: string }) => {
      try {
        const categories = await canvas.listGroupCategories(courseId);
        const summary = categories.map((c: any) => ({
          id: c.id,
          name: c.name,
          self_signup: c.self_signup ?? null,
          group_limit: c.group_limit ?? null,
          groups_count: c.groups_count ?? null,
          unassigned_users_count: c.unassigned_users_count ?? null,
        }));
        return { content: [{ type: "text", text: JSON.stringify(summary) }] };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch group categories: ${error.message}`);
        }
        throw new Error('Failed to fetch group categories: Unknown error');
      }
    }
  );

  // Tool: list-groups
  server.tool(
    "list-groups",
    "List the groups in a course (or in one group set). Returns group ID, name, group set ID, and member COUNT. Member names are intentionally not returned.",
    {
      courseId: z.string().describe("The ID of the course"),
      categoryId: z.string().optional().describe("Optional: only list groups in this group set (from list-group-categories)")
    },
    { readOnlyHint: true },
    async ({ courseId, categoryId }: { courseId: string; categoryId?: string }) => {
      try {
        const groups = categoryId
          ? await canvas.listCategoryGroups(categoryId)
          : await canvas.listCourseGroups(courseId);
        const summary = groups.map((g: any) => ({
          id: g.id,
          name: g.name,
          group_category_id: g.group_category_id,
          members_count: g.members_count,
          description: g.description ?? null,
          join_level: g.join_level,
        }));
        return { content: [{ type: "text", text: JSON.stringify(summary) }] };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch groups: ${error.message}`);
        }
        throw new Error('Failed to fetch groups: Unknown error');
      }
    }
  );

  // Tool: create-group-category
  server.tool(
    "create-group-category",
    "Create a group set in a course, optionally creating a number of empty groups in it. Students are not assigned to groups by this tool.",
    {
      courseId: z.string().describe("The ID of the course"),
      name: z.string().describe("Name of the group set, e.g. 'Project Teams'"),
      selfSignup: z.enum(["enabled", "restricted"]).optional().describe("Let students sign themselves up for groups ('restricted' = only within their section). Omit for instructor-assigned groups."),
      groupLimit: z.number().optional().describe("Maximum number of students per group"),
      createGroupCount: z.number().optional().describe("Number of empty groups to create in this set")
    },
    { destructiveHint: false },
    async ({ courseId, name, selfSignup, groupLimit, createGroupCount }: { courseId: string; name: string; selfSignup?: string; groupLimit?: number; createGroupCount?: number }) => {
      try {
        const data: any = { name };
        if (selfSignup) data.self_signup = selfSignup;
        if (groupLimit !== undefined) data.group_limit = groupLimit;
        if (createGroupCount !== undefined) data.create_group_count = createGroupCount;
        const c = await canvas.createGroupCategory(courseId, data);
        return {
          content: [{ type: "text", text: `Group set created: id=${c.id}, name="${c.name}", self_signup=${c.self_signup ?? 'off'}, group_limit=${c.group_limit ?? 'none'}` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to create group category: ${error.message}`);
        }
        throw new Error('Failed to create group category: Unknown error');
      }
    }
  );

  // Tool: create-group
  server.tool(
    "create-group",
    "Create a new, empty group inside an existing group set.",
    {
      categoryId: z.string().describe("The ID of the group set (from list-group-categories)"),
      name: z.string().describe("Name of the group"),
      description: z.string().optional(),
      joinLevel: z.enum(["parent_context_auto_join", "parent_context_request", "invitation_only"]).optional().describe("How students can join (course groups usually use 'invitation_only')")
    },
    { destructiveHint: false },
    async ({ categoryId, name, description, joinLevel }: { categoryId: string; name: string; description?: string; joinLevel?: string }) => {
      try {
        const data: any = { name };
        if (description !== undefined) data.description = description;
        if (joinLevel) data.join_level = joinLevel;
        const g = await canvas.createGroup(categoryId, data);
        return {
          content: [{ type: "text", text: `Group created: id=${g.id}, name="${g.name}", group_category_id=${g.group_category_id}` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to create group: ${error.message}`);
        }
        throw new Error('Failed to create group: Unknown error');
      }
    }
  );

  // Tool: add-group-member
  server.tool(
    "add-group-member",
    "Add one student to a group by user ID. The student's name is not returned.",
    {
      groupId: z.string().describe("The ID of the group (from list-groups)"),
      userId: z.string().describe("The Canvas user ID of the student to add")
    },
    { destructiveHint: false },
    async ({ groupId, userId }: { groupId: string; userId: string }) => {
      try {
        const m = await canvas.addGroupMember(groupId, { user_id: userId });
        return {
          content: [{ type: "text", text: `Membership created: id=${m.id}, group_id=${m.group_id}, user_id=${m.user_id}, state=${m.workflow_state}` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to add group member: ${error.message}`);
        }
        throw new Error('Failed to add group member: Unknown error');
      }
    }
  );
}
