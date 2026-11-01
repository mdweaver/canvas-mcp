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

  // ---------------------------------------------------------------------------
  // Group announcements. Privacy: only group names and member COUNTS are shown,
  // never member names.
  // ---------------------------------------------------------------------------

  const NL = String.fromCharCode(10);

  // Canvas announcement bodies are HTML. If the text contains no HTML tags,
  // blank-line-separated paragraphs become <p> and single line breaks become
  // <br>, so plain text keeps its layout. Text that already has tags is sent as-is.
  function toHtml(message: string): string {
    const text = message.split(String.fromCharCode(13)).join("");
    if (/<[a-z][^>]*>/i.test(text)) return text;
    const esc = (s: string) => s.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
    return text.split(NL + NL).map(p => "<p>" + esc(p).split(NL).join("<br>") + "</p>").join("");
  }

  function previewOf(html: any): string {
    return String(html ?? "").replace(/<[^>]*>/g, " ").split(NL).join(" ").split(" ").filter(Boolean).join(" ").slice(0, 300);
  }

  // Tool: post-group-announcement
  server.tool(
    "post-group-announcement",
    "Post an announcement to ONE student group. Only members of that group can see it (it appears in the group Announcements area). Plain text is converted to paragraphs; HTML is sent as-is. Posts immediately. For several groups at once use post-group-announcements.",
    {
      groupId: z.string().describe("The ID of the group (from list-groups)"),
      title: z.string().min(1).describe("The title of the announcement"),
      message: z.string().min(1).describe("The announcement text (plain text or HTML)"),
      published: z.boolean().optional().describe("Set false to ask Canvas for an unpublished draft. Canvas may ignore this for announcements, so do not rely on it to keep a message from students. Default: published immediately.")
    },
    { destructiveHint: false },
    async ({ groupId, title, message, published }: { groupId: string; title: string; message: string; published?: boolean }) => {
      try {
        const data: any = { title, message: toHtml(message), is_announcement: true };
        if (published !== undefined) data.published = published;
        const t = await canvas.postGroupAnnouncement(groupId, data);
        return {
          content: [{ type: "text", text: `Posted group announcement: group_id=${groupId}, topic_id=${t.id}, title=${JSON.stringify(title)}, published=${t.published}` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to post group announcement: ${error.message}`);
        }
        throw new Error("Failed to post group announcement: Unknown error");
      }
    }
  );

  // Tool: post-group-announcements
  server.tool(
    "post-group-announcements",
    "Post a different announcement to each of several student groups in one call. DRY RUN BY DEFAULT: with dryRun true (the default) it only lists the groups and titles it would post to, and posts nothing. Set dryRun to false to actually post. One announcement per group; groups with no members are skipped.",
    {
      announcements: z.array(z.object({
        groupId: z.string().describe("The ID of the group (from list-groups)"),
        title: z.string().min(1),
        message: z.string().min(1).describe("Plain text or HTML")
      })).min(1).max(60).describe("One entry per group"),
      dryRun: z.boolean().default(true).describe("When true (the default) nothing is posted. Set false to post for real.")
    },
    { destructiveHint: false },
    async ({ announcements, dryRun }: { announcements: { groupId: string; title: string; message: string }[]; dryRun: boolean }) => {
      const ids = announcements.map(a => a.groupId);
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dup.length > 0) {
        throw new Error(`Duplicate groupId in this batch: ${Array.from(new Set(dup)).join(", ")}. Send one announcement per group.`);
      }
      const lines: string[] = [];
      let posted = 0;
      let skipped = 0;
      let failed = 0;
      for (const a of announcements) {
        let label = `group ${a.groupId}`;
        try {
          const g = await canvas.getGroup(a.groupId);
          label = `group ${a.groupId} (${g.name}, ${g.members_count} member(s))`;
          if (g.members_count === 0) {
            skipped++;
            lines.push(`SKIPPED ${label}: the group has no members`);
            continue;
          }
          if (dryRun) {
            lines.push(`WOULD POST to ${label}: ${JSON.stringify(a.title)}`);
            continue;
          }
          const t = await canvas.postGroupAnnouncement(a.groupId, { title: a.title, message: toHtml(a.message), is_announcement: true });
          posted++;
          lines.push(`POSTED to ${label}: topic_id=${t.id}, ${JSON.stringify(a.title)}`);
        } catch (error) {
          failed++;
          lines.push(`FAILED ${label}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
      const header = dryRun
        ? `DRY RUN: nothing was posted (${announcements.length - skipped - failed} would post, ${skipped} skipped, ${failed} problem(s)). Call again with dryRun=false to post.`
        : `Posted ${posted} of ${announcements.length} (${skipped} skipped, ${failed} failed).`;
      return { content: [{ type: "text", text: header + NL + lines.join(NL) }] };
    }
  );

  // Tool: list-group-announcements
  server.tool(
    "list-group-announcements",
    "List the announcements posted in one student group, most recent first, with tags stripped and messages truncated to 300 characters. Author names are not returned.",
    {
      groupId: z.string().describe("The ID of the group (from list-groups)")
    },
    { readOnlyHint: true },
    async ({ groupId }: { groupId: string }) => {
      try {
        const items = await canvas.listGroupAnnouncements(groupId);
        const summary = items
          .map((a: any) => ({
            id: a.id,
            title: a.title,
            posted_at: a.posted_at ?? null,
            published: a.published ?? null,
            message_preview: previewOf(a.message),
          }))
          .sort((x: any, y: any) => String(y.posted_at ?? "").localeCompare(String(x.posted_at ?? "")));
        return { content: [{ type: "text", text: JSON.stringify(summary) }] };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch group announcements: ${error.message}`);
        }
        throw new Error("Failed to fetch group announcements: Unknown error");
      }
    }
  );
}
