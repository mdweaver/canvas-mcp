import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CanvasClient } from "../canvasClient.js";
import { Course } from "../types.js";

export function registerCourseTools(server: McpServer, canvas: CanvasClient) {
  // Tool: list-courses
  server.tool(
    "list-courses",
    "List all active courses for the authenticated user. Returns course name, ID, course code, and term for each course.",
    {},
    { readOnlyHint: true },
    async () => {
      try {
        const courses: Course[] = (await canvas.listCourses({
          enrollment_state: 'active',
          state: ['available'],
          per_page: 100,
          include: ['term']
        }) as any) as Course[];
        const formattedCourses = courses
          .filter(course => course.workflow_state === 'available')
          .map((course: Course) => {
            const termInfo = course.term ? ` (${course.term.name})` : '';
            return `Course: ${course.name}${termInfo}\nID: ${course.id}\nCode: ${course.course_code}\n---`;
          })
          .join('\n');
        return {
          content: [
            {
              type: "text",
              text: formattedCourses ?
                `Available Courses:\n\n${formattedCourses}` :
                "No active courses found.",
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch courses: ${error.message}`);
        }
        throw new Error('Failed to fetch courses: Unknown error');
      }
    }
  );

  // Tool: list-announcements
  server.tool(
    "list-announcements",
    "List announcements posted to a course, most recent first.",
    {
      courseId: z.string().describe("The ID of the course"),
      includeInactive: z.boolean().default(false).describe("Include announcements Canvas has marked deleted/unpublished"),
    },
    { readOnlyHint: true },
    async ({ courseId, includeInactive = false }: { courseId: string; includeInactive?: boolean }) => {
      try {
        const params: any = { order_by: 'recent_activity' };
        if (includeInactive) {
          params.include = ['all_dates'];
        }
        const announcements = await canvas.listAnnouncements(courseId, params);
        const formatted = announcements
          .map((a: any) => {
            const posted = a.posted_at ? new Date(a.posted_at).toLocaleString() : 'Not yet posted';
            const author = a.author?.display_name ? `\nPosted by: ${a.author.display_name}` : '';
            const message = a.message ? a.message.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
            const truncated = message.length > 300 ? `${message.slice(0, 300)}...` : message;
            return [
              `Title: ${a.title}`,
              `ID: ${a.id}`,
              `Posted: ${posted}`,
              `Status: ${a.published ? 'Published' : 'Unpublished'}`,
              `URL: ${a.html_url || ''}`,
              author,
              truncated ? `Message: ${truncated}` : 'Message: (empty)',
            ].filter(Boolean).join('\n');
          })
          .join('\n---\n');
        return {
          content: [
            {
              type: "text",
              text: announcements.length > 0
                ? `Announcements in course ${courseId}:\n\n${formatted}\n\nTotal announcements: ${announcements.length}`
                : "No announcements found in this course.",
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch announcements: ${error.message}`);
        }
        throw new Error('Failed to fetch announcements: Unknown error');
      }
    }
  );

  // Tool: get-syllabus
  server.tool(
    "get-syllabus",
    "Fetch the course's Syllabus body (the syllabus_body field on the course, rendered at the course's Syllabus page — this is what students see if the course home page is set to 'Syllabus'). Distinct from wiki pages.",
    {
      courseId: z.string().describe("The ID of the course"),
    },
    { readOnlyHint: true },
    async ({ courseId }: { courseId: string }) => {
      try {
        const course = await canvas.getCourse(courseId, { include: ['syllabus_body'] });
        return {
          content: [{ type: "text", text: JSON.stringify({ id: course.id, name: course.name, time_zone: course.time_zone, locale: course.locale, syllabus_body: course.syllabus_body || '' }) }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch syllabus: ${error.message}`);
        }
        throw new Error('Failed to fetch syllabus: Unknown error');
      }
    }
  );

  // Tool: update-syllabus
  server.tool(
    "update-syllabus",
    "Replace the course's Syllabus body (the syllabus_body field on the course). This is what's shown if the course home page is set to 'Syllabus', separate from any wiki page.",
    {
      courseId: z.string().describe("The ID of the course"),
      syllabusBody: z.string().describe("The new full HTML content for the syllabus body (replaces the entire field)"),
    },
    { idempotentHint: true },
    async ({ courseId, syllabusBody }: { courseId: string; syllabusBody: string }) => {
      try {
        const course = await canvas.updateCourse(courseId, { course: { syllabus_body: syllabusBody } });
        return {
          content: [{ type: "text", text: `Syllabus updated for course ${courseId} (${course.name || ''}).` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to update syllabus: ${error.message}`);
        }
        throw new Error('Failed to update syllabus: Unknown error');
      }
    }
  );

  // Tool: get-announcement
  server.tool(
    "get-announcement",
    "Fetch full details for a single announcement, including the raw HTML message body (unlike list-announcements, which strips tags for readability).",
    {
      courseId: z.string().describe("The ID of the course"),
      announcementId: z.string().describe("The ID of the announcement (discussion topic ID, from list-announcements)"),
    },
    { readOnlyHint: true },
    async ({ courseId, announcementId }: { courseId: string; announcementId: string }) => {
      try {
        const a = await canvas.getAnnouncement(courseId, announcementId);
        const summary = {
          id: a.id,
          title: a.title,
          message: a.message,
          posted_at: a.posted_at,
          delayed_post_at: a.delayed_post_at,
          lock_at: a.lock_at,
          published: a.published,
          locked: a.locked,
          pinned: a.pinned,
          html_url: a.html_url,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(summary) }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch announcement: ${error.message}`);
        }
        throw new Error('Failed to fetch announcement: Unknown error');
      }
    }
  );

  // Tool: update-announcement
  server.tool(
    "update-announcement",
    "Edit an existing announcement in a course (title, message, scheduling, publish/lock state). All fields optional except courseId and announcementId.",
    {
      courseId: z.string().describe("The ID of the course"),
      announcementId: z.string().describe("The ID of the announcement (discussion topic ID, from list-announcements)"),
      title: z.string().optional().describe("New title"),
      message: z.string().optional().describe("New body content (HTML)"),
      delayed_post_at: z.string().optional().describe("Reschedule when the announcement posts (ISO 8601); set to a future date to delay-post it"),
      lock_at: z.string().optional().describe("Date after which the announcement is locked for comments (ISO 8601)"),
      published: z.boolean().optional().describe("Show/hide the announcement from students"),
      locked: z.boolean().optional().describe("Lock/unlock commenting on the announcement"),
      pinned: z.boolean().optional().describe("Pin the announcement"),
    },
    { idempotentHint: true },
    async (args: any) => {
      const { courseId, announcementId, ...fields } = args;
      try {
        const a = await canvas.updateAnnouncement(courseId, announcementId, fields);
        return {
          content: [{ type: "text", text: `Announcement updated: id=${a.id}, title="${a.title}", published=${a.published}, posted_at=${a.posted_at || 'not yet posted'}` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to update announcement: ${error.message}`);
        }
        throw new Error('Failed to update announcement: Unknown error');
      }
    }
  );

  // Tool: post-announcement
  server.tool(
    "post-announcement",
    "Post an announcement to a specific course",
    {
      courseId: z.string().describe("The ID of the course"),
      title: z.string().describe("The title of the announcement"),
      message: z.string().describe("The content of the announcement")
    },
    { destructiveHint: false },
    async ({ courseId, title, message }: { courseId: string; title: string; message: string }) => {
      try {
        await canvas.postAnnouncement(courseId, {
          title,
          message,
          is_announcement: true,
        });
        return {
          content: [
            {
              type: "text",
              text: `Successfully posted announcement "${title}" to course ${courseId}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to post announcement: ${error.message}`);
        }
        throw new Error('Failed to post announcement: Unknown error');
      }
    }
  );
} 