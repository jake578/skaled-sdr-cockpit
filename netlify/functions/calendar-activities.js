// Fetches recent Google Calendar events for the activity feed
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  try {
    const token = await getAccessToken();

    // Get events from last 30 days + next 7 days
    const now = new Date();
    const past = new Date(now.getTime() - 30 * 86400000).toISOString();
    const future = new Date(now.getTime() + 7 * 86400000).toISOString();

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(past)}&timeMax=${encodeURIComponent(future)}` +
      `&maxResults=100&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: err, activities: [] }, { status: res.status });
    }

    const data = await res.json();
    const activities = [];

    (data.items || []).forEach(event => {
      const subject = event.summary || "—";
      const subjectLower = subject.toLowerCase();

      // Skip internal Skaled meetings
      if (subjectLower.includes("skaled") && (
        subjectLower.includes("l10") || subjectLower.includes("1:1") ||
        subjectLower.includes("all-hands") || subjectLower.includes("sync") ||
        subjectLower.includes("internal") || subjectLower.includes("staffing") ||
        subjectLower.includes("p&l") || subjectLower.includes("leadership")
      )) return;

      // Skip personal/blocked time
      if (subjectLower.includes("lunch") || subjectLower.includes("block") ||
          subjectLower.includes("focus time") || subjectLower.includes("ooo") ||
          subjectLower.includes("out of office")) return;

      const start = event.start?.dateTime || event.start?.date || "";
      const dateStr = start ? start.split("T")[0] : "—";
      const timeStr = event.start?.dateTime ? new Date(event.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "";

      // Get attendees (external only)
      const attendees = (event.attendees || [])
        .filter(a => !a.self && !(a.email || "").includes("skaled.com"))
        .map(a => a.displayName || a.email || "—");

      const isFuture = new Date(start) > now;

      activities.push({
        date: dateStr,
        time: timeStr,
        type: "meeting",
        direction: isFuture ? "upcoming" : "outbound",
        subject,
        contact: attendees.length > 0 ? attendees[0] : "—",
        company: "—",
        source: "Calendar",
        sortDate: start,
        attendeeCount: attendees.length,
        allAttendees: attendees.join(", "),
      });
    });

    return Response.json({ activities, count: activities.length });
  } catch (e) {
    return Response.json({ error: e.message, activities: [] }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/calendar-activities" };
