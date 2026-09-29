import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CanvasClient } from "../canvasClient.js";

export function registerAppointmentGroupTools(server: McpServer, canvas: CanvasClient) {
  // Tool: list-appointment-groups
  server.tool(
    "list-appointment-groups",
    "List appointment groups (e.g. office hours / sign-up slots) that can be reserved or managed by the current user.",
    {
      scope: z.enum(["reservable", "manageable"]).optional().describe("Defaults to 'reservable'. Use 'manageable' to see groups you created/administer."),
      courseId: z.string().optional().describe("If provided, limits results to this course."),
      includePastAppointments: z.boolean().optional().describe("Defaults to false."),
      include: z.array(z.enum(["appointments", "child_events", "participant_count", "reserved_times", "all_context_codes"])).optional().describe("Extra info to include, e.g. 'participant_count' to see signups per slot.")
    },
    { readOnlyHint: true },
    async ({ scope, courseId, includePastAppointments, include }: { scope?: string; courseId?: string; includePastAppointments?: boolean; include?: string[] }) => {
      try {
        const params: any = {};
        if (scope) params.scope = scope;
        if (courseId) params.context_codes = [`course_${courseId}`];
        if (includePastAppointments !== undefined) params.include_past_appointments = includePastAppointments;
        if (include && include.length) params.include = include;
        const groups = await canvas.listAppointmentGroups(params);
        const summary = groups.map((g: any) => ({
          id: g.id,
          title: g.title,
          workflow_state: g.workflow_state,
          start_at: g.start_at,
          end_at: g.end_at,
          appointments_count: g.appointments_count,
          participant_count: g.participant_count ?? null,
          participants_per_appointment: g.participants_per_appointment,
          context_codes: g.context_codes,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(summary) }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch appointment groups: ${error.message}`);
        }
        throw new Error('Failed to fetch appointment groups: Unknown error');
      }
    }
  );

  // Tool: get-appointment-group
  server.tool(
    "get-appointment-group",
    "Get full details for a single appointment group, including its time slots.",
    {
      appointmentGroupId: z.string().describe("The ID of the appointment group"),
      include: z.array(z.enum(["child_events", "appointments", "all_context_codes"])).optional().describe("Extra info to include, e.g. 'child_events' to see who has signed up for each slot.")
    },
    { readOnlyHint: true },
    async ({ appointmentGroupId, include }: { appointmentGroupId: string; include?: string[] }) => {
      try {
        const params: any = {};
        if (include && include.length) params.include = include;
        const group = await canvas.getAppointmentGroup(appointmentGroupId, params);
        return {
          content: [{ type: "text", text: JSON.stringify(group) }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to fetch appointment group: ${error.message}`);
        }
        throw new Error('Failed to fetch appointment group: Unknown error');
      }
    }
  );

  // Tool: create-appointment-group
  server.tool(
    "create-appointment-group",
    "Create a bundle of self-signup time slots (e.g. office hours) for a course. Give a start time, how long each block is, and how many blocks to generate; slots are generated back-to-back automatically. Students reserve slots themselves in Canvas — this tool does not reserve slots on anyone's behalf.",
    {
      courseId: z.string().describe("The ID of the course this appointment group belongs to"),
      title: z.string().describe("Short title, e.g. 'Office Hours' or 'Final Project Check-ins'"),
      startTime: z.string().describe("ISO 8601 start time of the first block, e.g. '2026-10-01T14:00:00-07:00'"),
      blockDurationMinutes: z.number().describe("Length of each time slot, in minutes"),
      numberOfBlocks: z.number().describe("How many consecutive time slots to generate"),
      breakMinutes: z.number().optional().describe("Gap between blocks, in minutes. Defaults to 0 (back-to-back)."),
      spotsPerBlock: z.number().optional().describe("Max number of students who can sign up per slot (participants_per_appointment). Omit for no limit."),
      description: z.string().optional(),
      locationName: z.string().optional(),
      sectionId: z.string().optional().describe("Restrict signups to a single course section instead of the whole course."),
      minAppointmentsPerParticipant: z.number().optional().describe("Minimum slots each student must book."),
      maxAppointmentsPerParticipant: z.number().optional().describe("Maximum slots each student may book."),
      participantVisibility: z.enum(["private", "protected"]).optional().describe("'protected' lets students see who else has signed up. Defaults to 'private'."),
      publish: z.boolean().optional().describe("If true, publishes immediately so students can see and sign up. Defaults to false (draft). Note: once published, an appointment group cannot be unpublished via the API.")
    },
    { destructiveHint: false },
    async (args: any) => {
      const {
        courseId, title, startTime, blockDurationMinutes, numberOfBlocks, breakMinutes,
        spotsPerBlock, description, locationName, sectionId,
        minAppointmentsPerParticipant, maxAppointmentsPerParticipant, participantVisibility, publish
      } = args;
      try {
        if (!Number.isInteger(numberOfBlocks) || numberOfBlocks < 1) {
          throw new Error('numberOfBlocks must be a positive integer');
        }
        if (blockDurationMinutes <= 0) {
          throw new Error('blockDurationMinutes must be greater than 0');
        }
        const start = new Date(startTime);
        if (isNaN(start.getTime())) {
          throw new Error(`Invalid startTime: ${startTime}`);
        }

        // Generate back-to-back (or gapped) [start_at, end_at] pairs from the
        // simple startTime + duration + count inputs, per Canvas's
        // appointment_group[new_appointments][X][] = [start_at, end_at] shape.
        const gapMs = (breakMinutes ?? 0) * 60000;
        const durationMs = blockDurationMinutes * 60000;
        const newAppointments: string[][] = [];
        let cursor = start.getTime();
        for (let i = 0; i < numberOfBlocks; i++) {
          const slotStart = new Date(cursor);
          const slotEnd = new Date(cursor + durationMs);
          newAppointments.push([slotStart.toISOString(), slotEnd.toISOString()]);
          cursor = slotEnd.getTime() + gapMs;
        }

        const fields: any = {
          context_codes: [`course_${courseId}`],
          title,
          new_appointments: newAppointments,
        };
        if (sectionId) fields.sub_context_codes = [`course_section_${sectionId}`];
        if (description !== undefined) fields.description = description;
        if (locationName !== undefined) fields.location_name = locationName;
        if (spotsPerBlock !== undefined) fields.participants_per_appointment = spotsPerBlock;
        if (minAppointmentsPerParticipant !== undefined) fields.min_appointments_per_participant = minAppointmentsPerParticipant;
        if (maxAppointmentsPerParticipant !== undefined) fields.max_appointments_per_participant = maxAppointmentsPerParticipant;
        if (participantVisibility !== undefined) fields.participant_visibility = participantVisibility;
        if (publish !== undefined) fields.publish = publish;

        const g = await canvas.createAppointmentGroup({ appointment_group: fields });
        const publishNote = publish
          ? ' (published — visible to students now)'
          : ' (draft — not yet visible to students; use publish-appointment-group to publish)';
        return {
          content: [{ type: "text", text: `Appointment group created: id=${g.id}, title="${g.title}", ${numberOfBlocks} slot(s) of ${blockDurationMinutes}min starting ${g.start_at || newAppointments[0][0]}${publishNote}` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to create appointment group: ${error.message}`);
        }
        throw new Error('Failed to create appointment group: Unknown error');
      }
    }
  );

  // Tool: publish-appointment-group
  server.tool(
    "publish-appointment-group",
    "Publish a draft appointment group so students can see it and sign up. This cannot be undone via the Canvas API.",
    {
      appointmentGroupId: z.string().describe("The ID of the appointment group to publish")
    },
    { idempotentHint: true },
    async ({ appointmentGroupId }: { appointmentGroupId: string }) => {
      try {
        const g = await canvas.updateAppointmentGroup(appointmentGroupId, { appointment_group: { publish: true } });
        return {
          content: [{ type: "text", text: `Appointment group ${g.id} ("${g.title}") published. workflow_state=${g.workflow_state}` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to publish appointment group: ${error.message}`);
        }
        throw new Error('Failed to publish appointment group: Unknown error');
      }
    }
  );

  // Tool: delete-appointment-group
  server.tool(
    "delete-appointment-group",
    "Permanently delete an appointment group and all its time slots. Students who have already signed up will lose their reservations. This cannot be undone.",
    {
      appointmentGroupId: z.string().describe("The ID of the appointment group to delete"),
      cancelReason: z.string().optional().describe("Optional reason sent to students who had reservations in this group.")
    },
    { destructiveHint: true },
    async ({ appointmentGroupId, cancelReason }: { appointmentGroupId: string; cancelReason?: string }) => {
      try {
        const params: any = {};
        if (cancelReason) params.cancel_reason = cancelReason;
        const result = await canvas.deleteAppointmentGroup(appointmentGroupId, params);
        return {
          content: [{ type: "text", text: `Appointment group ${appointmentGroupId} deleted successfully. workflow_state=${result?.workflow_state ?? 'deleted'}` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to delete appointment group: ${error.message}`);
        }
        throw new Error('Failed to delete appointment group: Unknown error');
      }
    }
  );

  // Tool: update-appointment-group-times
  server.tool(
    "update-appointment-group-times",
    "Update the start and/or end time of a specific time slot (calendar event) within an appointment group. Use get-appointment-group with include=['appointments'] to find slot IDs. Times must be ISO 8601 strings with timezone offset (e.g. '2026-11-03T17:00:00-08:00').",
    {
      calendarEventId: z.string().describe("The ID of the individual time slot (appointment) to update — NOT the appointment group ID. Get slot IDs from get-appointment-group with include=['appointments']."),
      startAt: z.string().optional().describe("New start time as ISO 8601 with timezone offset, e.g. '2026-11-03T17:00:00-08:00'"),
      endAt: z.string().optional().describe("New end time as ISO 8601 with timezone offset, e.g. '2026-11-03T18:00:00-08:00'"),
      locationName: z.string().optional().describe("Optionally update the location name for this slot.")
    },
    { destructiveHint: false },
    async ({ calendarEventId, startAt, endAt, locationName }: { calendarEventId: string; startAt?: string; endAt?: string; locationName?: string }) => {
      try {
        if (!startAt && !endAt && !locationName) {
          throw new Error('At least one of startAt, endAt, or locationName must be provided.');
        }
        const eventData: any = { calendar_event: {} };
        if (startAt) eventData.calendar_event.start_at = startAt;
        if (endAt) eventData.calendar_event.end_at = endAt;
        if (locationName) eventData.calendar_event.location_name = locationName;
        const result = await canvas.updateCalendarEvent(calendarEventId, eventData);
        return {
          content: [{ type: "text", text: `Calendar event ${result.id} updated. start_at=${result.start_at}, end_at=${result.end_at}, location=${result.location_name ?? '(unchanged)'}` }]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to update appointment time: ${error.message}`);
        }
        throw new Error('Failed to update appointment time: Unknown error');
      }
    }
  );
}
